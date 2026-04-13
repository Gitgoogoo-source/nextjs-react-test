import { NextResponse } from 'next/server';

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

export async function POST(request: Request) {
  try {
    const { chestId } = await request.json();
    
    if (!chestId || !DROP_RATES[chestId as keyof typeof DROP_RATES]) {
      return NextResponse.json({ error: 'Invalid chest ID' }, { status: 400 });
    }

    const rates = DROP_RATES[chestId as keyof typeof DROP_RATES];
    
    // 计算随机结果
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
