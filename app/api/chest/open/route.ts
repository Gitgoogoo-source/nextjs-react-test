import { jsonActionErr, jsonActionOk } from '@/lib/api-json';
import { revalidateGameRoot } from '@/lib/revalidate-game';
import { createAdminClient } from '@/lib/supabase/admin';
import { validateTelegramWebAppData } from '@/lib/telegram';
import { checkRateLimit, rateLimitExceededResponse, telegramScope } from '@/lib/rate-limit';
import type { Database } from '@/types/supabase';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

type CaseItemDropRow = Pick<Database['public']['Tables']['case_items']['Row'], 'item_id' | 'drop_chance'>;
type ItemDisplayRow = Pick<Database['public']['Tables']['items']['Row'], 'id' | 'name' | 'rarity' | 'color' | 'border' | 'hex'>;

type RpcResult = {
  success?: boolean;
  already_processed?: boolean;
  item_id?: string;
  assets?: { balance?: number; stars?: number };
} | null;

const openChestSchema = z.object({
  chestId: z.string().uuid(),
  requestId: z.string().uuid().optional(),
  initData: z.string().min(1),
});

function pickWeightedItem(rows: { item_id: string; weight: number }[]) {
  const total = rows.reduce((acc, r) => acc + r.weight, 0);
  if (!Number.isFinite(total) || total <= 0) return null;
  let cumulative = 0;
  const rand = Math.random() * total;
  for (const r of rows) {
    cumulative += r.weight;
    if (rand <= cumulative) return r.item_id;
  }
  return rows[rows.length - 1]?.item_id ?? null;
}

async function loadChestConfig(supabase: SupabaseClient<Database>, chestId: string) {
  const [chestRes, itemsRes] = await Promise.all([
    supabase.from('cases').select('id, price, case_key').eq('id', chestId).maybeSingle(),
    supabase.from('case_items').select('item_id, drop_chance').eq('case_id', chestId),
  ]);
  return { chestInfo: chestRes.data, chestErr: chestRes.error, caseItems: itemsRes.data, caseItemsErr: itemsRes.error };
}

async function loadUserRecord(supabase: SupabaseClient<Database>, telegramId: number) {
  const { data, error } = await supabase.from('users').select('id, balance').eq('telegram_id', telegramId).maybeSingle();
  return { dbUser: data, userErr: error };
}

async function validateUserHasChest(supabase: SupabaseClient<Database>, userId: string, chestId: string) {
  const { data, error } = await supabase.from('user_cases').select('id, quantity').eq('user_id', userId).eq('case_id', chestId).maybeSingle();
  return { userCase: data, caseErr: error };
}

async function loadFinalItem(supabase: SupabaseClient<Database>, itemId: string) {
  const { data, error } = await supabase.from('items').select('id, name, rarity, color, border, hex').eq('id', itemId).maybeSingle();
  return { item: data as ItemDisplayRow | null, itemErr: error };
}

async function loadUserAssets(supabase: SupabaseClient<Database>, userId: string) {
  const { data, error } = await supabase.from('users').select('balance, stars').eq('id', userId).maybeSingle();
  if (error || !data) return undefined;
  return { balance: Number(data.balance || 0), stars: Number(data.stars || 0) };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { chestId, requestId, initData } = openChestSchema.parse(body);

    // 安全：已验证 Telegram initData 防止请求伪造
    const { isValid, user: tgUser } = validateTelegramWebAppData(initData);
    if (!isValid || !tgUser) return jsonActionErr('身份验证失败', 401);

    let supabase: SupabaseClient<Database>;
    try {
      supabase = createAdminClient();
    } catch {
      return jsonActionErr('服务器配置错误', 500);
    }

    const rateLimitResult = await checkRateLimit(supabase, {
      scope: telegramScope(tgUser.id),
      route: 'chest/open',
      limit: 20,
      windowSeconds: 60,
    });
    if (!rateLimitResult.allowed) return rateLimitExceededResponse(rateLimitResult);

    // 1. 并行加载宝箱配置与用户记录
    const [{ chestInfo, chestErr, caseItems, caseItemsErr }, { dbUser, userErr }] = await Promise.all([
      loadChestConfig(supabase, chestId),
      loadUserRecord(supabase, tgUser.id),
    ]);

    if (chestErr || !chestInfo) return jsonActionErr('数据库中未找到该宝箱类型', 404);
    if (userErr || !dbUser) return jsonActionErr('用户不存在', 404);

    const price = Number(chestInfo.price ?? 0);
    if (!Number.isSafeInteger(price) || price <= 0) return jsonActionErr('宝箱价格无效', 400);

    if (caseItemsErr) return jsonActionErr('数据库错误', 500);

    const normalized = (caseItems || [])
      .map((r) => r as CaseItemDropRow)
      .filter((r) => r.item_id && Number(r.drop_chance) > 0)
      .map((r) => ({ item_id: r.item_id, weight: Number(r.drop_chance) }));
    if (normalized.length === 0) return jsonActionErr('宝箱掉落表未配置', 500);

    // 2. 校验用户拥有宝箱 + 余额
    const { userCase, caseErr } = await validateUserHasChest(supabase, dbUser.id, chestId);
    if (caseErr || !userCase || userCase.quantity <= 0) return jsonActionErr('宝箱数量不足', 400);
    if (Number(dbUser.balance ?? 0) < price) return jsonActionErr('叶子不足', 400);

    // 3. 权重抽奖
    const itemUuid = pickWeightedItem(normalized);
    if (!itemUuid) return jsonActionErr('宝箱掉落表无效', 500);

    // 4. 原子 RPC：扣宝箱 + 扣余额 + 发放物品
    const effectiveRequestId = requestId ?? crypto.randomUUID();
    const { data: rpcData, error: rpcError } = await supabase.rpc('open_chest_secure', {
      p_user_id: dbUser.id,
      p_chest_id: chestId,
      p_price: price,
      p_item_id: itemUuid,
      p_request_id: effectiveRequestId,
    });

    if (rpcError) {
      console.error('RPC Error (open_chest_secure):', rpcError);
      const msg = rpcError.message || '';
      if (msg.includes('Insufficient balance')) return jsonActionErr('叶子不足', 400);
      if (msg.includes('Not enough chests')) return jsonActionErr('宝箱数量不足', 400);
      return jsonActionErr('服务器内部错误', 500);
    }

    const parsedRpc = rpcData as RpcResult;
    const finalItemId = parsedRpc?.item_id || itemUuid;

    // 5. 读取最终物品信息与最新资产
    const [{ item: finalItemInfo, itemErr: finalItemErr }, rpcAssets] = await Promise.all([
      loadFinalItem(supabase, finalItemId),
      parsedRpc?.assets ? Promise.resolve(parsedRpc.assets) : Promise.resolve(null),
    ]);

    if (finalItemErr || !finalItemInfo) return jsonActionErr('奖品物品不存在', 500);

    const userAssets = rpcAssets
      ? { balance: Number(rpcAssets.balance || 0), stars: Number(rpcAssets.stars || 0) }
      : await loadUserAssets(supabase, dbUser.id);

    revalidateGameRoot();

    return jsonActionOk({
      wonItem: finalItemInfo,
      randomOffset: Math.floor(Math.random() * 60) - 30,
      userAssets,
    });
  } catch (error: unknown) {
    if ((error as { name?: string })?.name === 'ZodError') return jsonActionErr('请求参数无效', 400);
    console.error('Error opening chest:', error);
    return jsonActionErr('服务器内部错误', 500);
  }
}
