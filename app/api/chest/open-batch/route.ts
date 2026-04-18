import { jsonActionErr, jsonActionOk } from '@/lib/api-json';
import { revalidateGameRoot } from '@/lib/revalidate-game';
import { createAdminClient } from '@/lib/supabase/admin';
import { validateTelegramWebAppData } from '@/lib/telegram';
import { checkRateLimit, rateLimitExceededResponse, telegramScope } from '@/lib/rate-limit';
import type { Database } from '@/types/supabase';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const BATCH_TIMES = 10;

type CaseItemDropRow = Pick<Database['public']['Tables']['case_items']['Row'], 'item_id' | 'drop_chance'>;
type ItemDisplayRow = Pick<Database['public']['Tables']['items']['Row'], 'id' | 'name' | 'rarity' | 'color' | 'border' | 'hex'>;

type BatchRpcResult = {
  success?: boolean;
  items?: Array<{ index: number; item_id: string; already_processed: boolean }>;
  already_processed_count?: number;
  assets?: { balance?: number; stars?: number };
  case_quantity_after?: number;
} | null;

const openBatchSchema = z.object({
  chestId: z.string().uuid(),
  requestIds: z.array(z.string().uuid()).length(BATCH_TIMES),
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

async function loadItemsByIds(supabase: SupabaseClient<Database>, itemIds: string[]): Promise<ItemDisplayRow[]> {
  const uniqueIds = [...new Set(itemIds)];
  const { data, error } = await supabase
    .from('items')
    .select('id, name, rarity, color, border, hex')
    .in('id', uniqueIds);
  if (error || !data) return [];
  return data as ItemDisplayRow[];
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = openBatchSchema.safeParse(body);
    if (!parsed.success) return jsonActionErr('请求参数无效', 400);
    const { chestId, requestIds, initData } = parsed.data;

    // 安全：已验证 Telegram initData 防止请求伪造
    const { isValid, user: tgUser } = validateTelegramWebAppData(initData);
    if (!isValid || !tgUser) return jsonActionErr('身份验证失败', 401);

    let supabase: SupabaseClient<Database>;
    try {
      supabase = createAdminClient();
    } catch {
      return jsonActionErr('服务器配置错误', 500);
    }

    // 限流：60 次开箱/60s，十连按 10 次计
    const rateLimitResult = await checkRateLimit(supabase, {
      scope: telegramScope(tgUser.id),
      route: 'chest/open-batch',
      limit: 60,
      windowSeconds: 60,
      delta: BATCH_TIMES,
    });
    if (!rateLimitResult.allowed) return rateLimitExceededResponse(rateLimitResult);

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

    // 应用层预检（RPC 内还有原子级校验，这里提前快速失败）
    const { userCase, caseErr } = await validateUserHasChest(supabase, dbUser.id, chestId);
    if (caseErr || !userCase || userCase.quantity < BATCH_TIMES) return jsonActionErr('宝箱数量不足', 400);
    if (Number(dbUser.balance ?? 0) < price * BATCH_TIMES) return jsonActionErr('叶子不足', 400);

    // 服务端抽奖（随机源在 Node 端，与单开保持一致）
    const itemUuids: string[] = [];
    for (let i = 0; i < BATCH_TIMES; i++) {
      const picked = pickWeightedItem(normalized);
      if (!picked) return jsonActionErr('宝箱掉落表无效', 500);
      itemUuids.push(picked);
    }

    // 原子 RPC：批量扣箱 + 扣余额 + 发放物品
    const { data: rpcData, error: rpcError } = await supabase.rpc('open_chest_batch_secure', {
      p_user_id: dbUser.id,
      p_chest_id: chestId,
      p_price: price,
      p_item_ids: itemUuids,
      p_request_ids: requestIds,
      p_times: BATCH_TIMES,
    });

    if (rpcError) {
      console.error('RPC Error (open_chest_batch_secure):', rpcError);
      const msg = rpcError.message || '';
      if (msg.includes('Insufficient balance')) return jsonActionErr('叶子不足', 400);
      if (msg.includes('Not enough chests')) return jsonActionErr('宝箱数量不足', 400);
      if (msg.includes('Array length mismatch')) return jsonActionErr('参数无效', 400);
      return jsonActionErr('服务器内部错误', 500);
    }

    const parsedRpc = rpcData as BatchRpcResult;
    if (!parsedRpc?.success) return jsonActionErr('开箱失败', 500);

    // 从 RPC 结果取最终物品 ID 序列（幂等重试时以事件表历史为准）
    const finalItemIds = (parsedRpc.items || [])
      .sort((a, b) => a.index - b.index)
      .map((it) => it.item_id);

    // 批量加载物品展示信息（单次 IN 查询）
    const itemMap = new Map<string, ItemDisplayRow>();
    const itemRows = await loadItemsByIds(supabase, finalItemIds);
    for (const row of itemRows) itemMap.set(row.id, row);

    const wonItems = finalItemIds
      .map((id) => itemMap.get(id))
      .filter((it): it is ItemDisplayRow => it != null);

    if (wonItems.length === 0) return jsonActionErr('奖品物品不存在', 500);

    const assets = parsedRpc.assets
      ? { balance: Number(parsedRpc.assets.balance || 0), stars: Number(parsedRpc.assets.stars || 0) }
      : undefined;

    revalidateGameRoot();

    return jsonActionOk({
      wonItems,
      randomOffset: Math.floor(Math.random() * 60) - 30,
      userAssets: assets,
      caseQuantityAfter: parsedRpc.case_quantity_after ?? null,
    });
  } catch (error: unknown) {
    if ((error as { name?: string })?.name === 'ZodError') return jsonActionErr('请求参数无效', 400);
    console.error('Error opening chest batch:', error);
    return jsonActionErr('服务器内部错误', 500);
  }
}
