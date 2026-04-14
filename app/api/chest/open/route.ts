import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

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
  ]
};

const CHEST_PRICES: Record<string, number> = {
  normal: 100,
  rare: 500,
  exclusive: 2000,
};

// 映射前端的 mock ID 到数据库的 UUID
const ITEM_ID_MAP: Record<number, string> = {
  1: '11111111-1111-1111-1111-111111111111',
  2: '22222222-2222-2222-2222-222222222222',
  3: '33333333-3333-3333-3333-333333333333',
  4: '44444444-4444-4444-4444-444444444444',
  5: '55555555-5555-5555-5555-555555555555',
};

export async function POST(request: Request) {
  try {
    const { chestId, userId: telegramUserId } = await request.json();
    
    if (!telegramUserId || !chestId || !DROP_RATES[chestId as keyof typeof DROP_RATES]) {
      return NextResponse.json({ error: 'Invalid request data' }, { status: 400 });
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

    // 1. 获取用户信息
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, balance')
      .eq('telegram_id', telegramUserId)
      .maybeSingle();

    if (userError || !user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // 2. 检查用户是否拥有该宝箱
    const { data: userCase, error: caseError } = await supabase
      .from('user_cases')
      .select('id, quantity')
      .eq('user_id', user.id)
      .eq('case_id', chestId)
      .maybeSingle();

    if (caseError || !userCase || userCase.quantity <= 0) {
      return NextResponse.json({ error: 'Not enough chests' }, { status: 400 });
    }

    // 3. 检查余额是否足够
    const price = CHEST_PRICES[chestId as keyof typeof CHEST_PRICES] || 0;
    if (user.balance < price) {
      return NextResponse.json({ error: 'Insufficient balance' }, { status: 400 });
    }

    // 4. 计算随机结果
    const rates = DROP_RATES[chestId as keyof typeof DROP_RATES];
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

    // 使用安全的 RPC 函数执行数据库更新 (扣除宝箱、扣除余额、增加物品)
    // 这样可以避免并发请求导致的余额或宝箱数量超扣问题
    const { data: rpcData, error: rpcError } = await supabase.rpc('open_chest_secure', {
      p_user_id: user.id,
      p_chest_id: chestId,
      p_price: price,
      p_item_id: itemUuid
    });

    if (rpcError) {
      console.error('RPC Error:', rpcError);
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
  } catch (error) {
    console.error('Error opening chest:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
