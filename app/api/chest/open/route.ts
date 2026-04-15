import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { validateTelegramWebAppData } from '@/lib/telegram';
import { z } from 'zod';

// 模拟数据库中的掉率表
const DROP_RATES = {
  normal: [
    { id: 1, chance: 70 }, // 军规级鸭子
    { id: 2, chance: 20 }, // 受限级鸭子
    { id: 3, chance: 8 },  // 保密级鸭子
    { id: 4, chance: 1.5 },// 隐秘级鸭子
    { id: 5, chance: 0.5 },// 罕见级鸭子
  ],
  rare: [
    { id: 1, chance: 30 },
    { id: 2, chance: 40 },
    { id: 3, chance: 20 },
    { id: 4, chance: 8 },
    { id: 5, chance: 2 },
  ],
  exclusive: [
    { id: 1, chance: 0 },
    { id: 2, chance: 0 },
    { id: 3, chance: 30 },
    { id: 4, chance: 50 },
    { id: 5, chance: 20 },
  ],
  legend: [
    { id: 1, chance: 0 },
    { id: 2, chance: 0 },
    { id: 3, chance: 0 },
    { id: 4, chance: 0 },
    { id: 5, chance: 100 },
  ]
};

// SECURITY: 价格不再硬编码，而是从数据库 cases 表读取
// 这样可以确保前后端价格一致，防止客户端篡改价格

// 映射前端的 mock ID 到数据库的 UUID
const ITEM_ID_MAP: Record<number, string> = {
  1: '11111111-1111-1111-1111-111111111111',
  2: '22222222-2222-2222-2222-222222222222',
  3: '33333333-3333-3333-3333-333333333333',
  4: '44444444-4444-4444-4444-444444444444',
  5: '55555555-5555-5555-5555-555555555555',
};

const openChestSchema = z.object({
  // 统一：前端只传 cases.id（UUID）
  chestId: z.string().uuid(),
  initData: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { chestId, initData } = openChestSchema.parse(body);
    
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

    // SECURITY: 使用数据库中的价格，而不是前端传来的价格
    const price = chestInfo.price || 0;
    if (price <= 0) {
      return NextResponse.json({ error: 'Invalid chest price' }, { status: 400 });
    }

    // SECURITY: 掉率与宝箱类型以 cases.case_key 为准，避免 UUID/类型混用
    const caseKey = (chestInfo.case_key || '') as keyof typeof DROP_RATES;
    if (!caseKey || !DROP_RATES[caseKey]) {
      return NextResponse.json({ error: 'Invalid chest type' }, { status: 400 });
    }

    // 2. 获取用户信息
    const { data: dbUser, error: userError } = await supabase
      .from('users')
      .select('id, balance')
      .eq('telegram_id', tgUser.id.toString())
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
    if (dbUser.balance < price) {
      return NextResponse.json({ error: 'Insufficient balance' }, { status: 400 });
    }

    // 4. 计算随机结果
    const rates = DROP_RATES[caseKey];
    const rand = Math.random() * 100;
    let cumulative = 0;
    let wonItemId = 1;
    
    for (const item of rates) {
      cumulative += item.chance;
      if (rand <= cumulative) {
        wonItemId = item.id;
        break;
      }
    }

    const itemUuid = ITEM_ID_MAP[wonItemId];
    if (!itemUuid) {
      // SECURITY: 服务器端奖品映射缺失时直接拒绝，避免写入异常/不可预测行为
      return NextResponse.json({ error: 'Server prize mapping error' }, { status: 500 });
    }

    // 使用安全的 RPC 函数执行数据库更新 (扣除宝箱、扣除余额、增加物品)
    // 这样可以避免并发请求导致的余额或宝箱数量超扣问题
    const { error: rpcError } = await supabase.rpc('open_chest_secure', {
      p_user_id: dbUser.id,
      p_chest_id: chestId, // UUID
      p_price: price,
      p_item_id: itemUuid
    });

    if (rpcError) {
      console.error('RPC Error:', rpcError);
      // SECURITY: PostgREST rpc 对同名函数重载不稳定，需保证数据库只保留一个签名
      const msg = rpcError.message || '';
      if (msg.includes('schema cache') || msg.includes('Could not find the function')) {
        return NextResponse.json(
          { error: 'Server RPC misconfigured (open_chest_secure)' },
          { status: 500 }
        );
      }
      // 根据错误信息返回对应的状态
      if (rpcError.message.includes('Insufficient balance')) {
        return NextResponse.json({ error: 'Insufficient balance' }, { status: 400 });
      }
      if (rpcError.message.includes('Not enough chests')) {
        return NextResponse.json({ error: 'Not enough chests' }, { status: 400 });
      }
      throw rpcError;
    }

    // 生成随机偏移量 (-30 到 30)
    const randomOffset = Math.floor(Math.random() * 60) - 30;

    return NextResponse.json({
      wonItemId,
      randomOffset
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
