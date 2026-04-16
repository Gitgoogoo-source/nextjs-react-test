import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { validateTelegramWebAppData } from '@/lib/telegram';
import { z } from 'zod';

interface CaseItemRow {
  item_id: string;
  drop_chance: number | string;
}

interface ItemRow {
  id: string;
  name: string;
  rarity: string;
  color: string;
  border: string;
  hex: string;
}

function pickWeightedItem(rows: { item_id: string; weight: number }[]) {
  const total = rows.reduce((acc, r) => acc + r.weight, 0);
  if (!Number.isFinite(total) || total <= 0) return null;
  const rand = Math.random() * total;
  let cumulative = 0;
  for (const r of rows) {
    cumulative += r.weight;
    if (rand <= cumulative) return r.item_id;
  }
  return rows[rows.length - 1]?.item_id ?? null;
}

const openChestSchema = z.object({
  // 统一：前端只传 cases.id（UUID）
  chestId: z.string().uuid(),
  // 幂等键：断网/超时/重试不重复开箱
  // NOTE: 线上数据库可能仍是旧版 RPC（不支持 request_id），因此这里允许可选，服务端会做兼容降级
  requestId: z.string().uuid().optional(),
  initData: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { chestId, requestId, initData } = openChestSchema.parse(body);
    
    // SECURITY: 服务端校验 Telegram initData，拒绝伪造 userId
    const { isValid, user: tgUser } = validateTelegramWebAppData(initData);
    if (!isValid || !tgUser) {
      return NextResponse.json({ error: '身份验证失败' }, { status: 401 });
    }

    let supabase;
    try {
      supabase = createAdminClient();
    } catch (error) {
      console.error('Error creating admin client:', error);
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    // 1. 从数据库获取宝箱的实时价格与 case_key（SECURITY: 防止客户端篡改价格）
    const { data: chestInfo, error: chestInfoError } = await supabase
      .from('cases')
      .select('id, price, case_key')
      .eq('id', chestId) // UUID
      .maybeSingle();

    if (chestInfoError || !chestInfo) {
      console.error('Error fetching chest price:', chestInfoError);
      return NextResponse.json({ error: 'Chest type not found in database' }, { status: 404 });
    }

    // SECURITY: 使用数据库中的价格，而不是前端传来的价格（RPC 侧期望 integer）
    const price = Number(chestInfo.price ?? 0);
    if (!Number.isSafeInteger(price) || price <= 0) {
      return NextResponse.json({ error: 'Invalid chest price' }, { status: 400 });
    }

    // SECURITY: 掉率与奖池以 case_items 为准（后台可配置，避免硬编码与前端篡改）
    const { data: caseItems, error: caseItemsError } = await supabase
      .from('case_items')
      .select('item_id, drop_chance')
      .eq('case_id', chestId);

    if (caseItemsError) {
      console.error('Error fetching case_items:', caseItemsError);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    const normalized = (caseItems || [])
      .map((r) => r as CaseItemRow)
      .filter((r) => r.item_id && Number(r.drop_chance) > 0)
      .map((r) => ({ item_id: r.item_id, weight: Number(r.drop_chance) }));

    if (normalized.length === 0) {
      return NextResponse.json({ error: 'Chest drop table not configured' }, { status: 500 });
    }

    // 2. 获取用户信息
    const { data: dbUser, error: userError } = await supabase
      .from('users')
      .select('id, balance')
      .eq('telegram_id', tgUser.id)
      .maybeSingle();

    if (userError || !dbUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // 3. 检查用户是否拥有该宝箱
    const { data: userCase, error: caseError } = await supabase
      .from('user_cases')
      .select('id, quantity')
      .eq('user_id', dbUser.id)
      .eq('case_id', chestId) // UUID
      .maybeSingle();

    if (caseError || !userCase || userCase.quantity <= 0) {
      return NextResponse.json({ error: 'Not enough chests' }, { status: 400 });
    }

    // 4. 检查余额是否足够
    if (Number(dbUser.balance ?? 0) < price) {
      return NextResponse.json({ error: 'Insufficient balance' }, { status: 400 });
    }

    // 5. 按数据库权重抽取 item_id（可不要求总和=100，按 total 归一化）
    const itemUuid = pickWeightedItem(normalized);
    if (!itemUuid) {
      return NextResponse.json({ error: 'Chest drop table invalid' }, { status: 500 });
    }

    // 使用安全的 RPC 函数执行数据库更新 (扣除宝箱、扣除余额、增加物品)
    // SECURITY: 统一使用带 request_id 的签名（幂等/可审计）
    const effectiveRequestId = requestId ?? crypto.randomUUID();

    type RpcResult =
      | {
          success?: boolean;
          already_processed?: boolean;
          item_id?: string;
          assets?: { balance?: number; stars?: number };
          case_quantity_after?: number;
        }
      | null;

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
      if (msg.includes('Insufficient balance')) {
        return NextResponse.json({ error: 'Insufficient balance' }, { status: 400 });
      }
      if (msg.includes('Not enough chests')) {
        return NextResponse.json({ error: 'Not enough chests' }, { status: 400 });
      }
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }

    const parsedRpc = rpcData as RpcResult;

    const finalItemId = parsedRpc?.item_id || itemUuid;

    // 若幂等命中，必须返回同一 item
    if (parsedRpc?.already_processed && parsedRpc?.item_id && parsedRpc.item_id !== itemUuid) {
      // 覆盖展示 item
      // SECURITY: 以 DB 事件记录为准，避免重试时“换奖品”
    }

    // 从 DB 读取最终展示 item（幂等命中时使用 event 的 item_id）
    const { data: finalItemInfo, error: finalItemInfoError } = await supabase
      .from('items')
      .select('id, name, rarity, color, border, hex')
      .eq('id', finalItemId)
      .maybeSingle();

    if (finalItemInfoError || !finalItemInfo) {
      console.error('Error fetching final item info:', finalItemInfoError);
      return NextResponse.json({ error: 'Prize item not found' }, { status: 500 });
    }

    // 生成随机偏移量 (-30 到 30)
    const randomOffset = Math.floor(Math.random() * 60) - 30;

    // 若旧签名未返回 assets，则强制从 DB 读取最新资产（可信来源）
    let userAssets:
      | {
          balance: number;
          stars: number;
        }
      | undefined = parsedRpc?.assets
      ? {
          balance: Number(parsedRpc.assets.balance || 0),
          stars: Number(parsedRpc.assets.stars || 0),
        }
      : undefined;

    if (!userAssets) {
      const { data: assetsRow, error: assetsErr } = await supabase
        .from('users')
        .select('balance, stars')
        .eq('id', dbUser.id)
        .maybeSingle();
      if (!assetsErr && assetsRow) {
        userAssets = { balance: Number(assetsRow.balance || 0), stars: Number(assetsRow.stars || 0) };
      }
    }

    return NextResponse.json({
      wonItem: finalItemInfo as ItemRow,
      randomOffset,
      userAssets,
    });
  } catch (error: unknown) {
    const err = error as { name?: string };
    if (err?.name === 'ZodError') {
      return NextResponse.json({ error: 'Invalid request payload' }, { status: 400 });
    }
    console.error('Error opening chest:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
