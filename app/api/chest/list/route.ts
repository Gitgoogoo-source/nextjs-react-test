import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { validateTelegramWebAppData } from '@/lib/telegram';
import { z } from 'zod';

// 宝箱类型的前端配置映射（静态属性：颜色、图标、描述等）
// SECURITY: 不包含价格，价格必须从数据库 cases 表读取
const CHEST_TYPE_CONFIG: Record<string, {
  name: string;
  color: string;
  shadow: string;
  description: string;
}> = {
  normal: {
    name: '普通宝箱',
    color: 'from-blue-400 to-blue-600',
    shadow: 'shadow-blue-500/50',
    description: '包含基础物品和普通鸭子',
  },
  rare: {
    name: '稀有宝箱',
    color: 'from-purple-400 to-purple-600',
    shadow: 'shadow-purple-500/50',
    description: '高概率获得稀有物品和特殊鸭子',
  },
  exclusive: {
    name: '绝版宝箱',
    color: 'from-red-400 to-orange-500',
    shadow: 'shadow-red-500/50',
    description: '必定获得极其珍贵的绝版物品',
  },
  legend: {
    name: '传说宝箱',
    color: 'from-yellow-400 to-yellow-600',
    shadow: 'shadow-yellow-500/50',
    description: '必定获得传说级物品，万中无一',
  }
};

const listChestsSchema = z.object({
  initData: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { initData } = listChestsSchema.parse(body);

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
        { error: 'Server configuration error: SUPABASE_SERVICE_ROLE_KEY missing' },
        { status: 500 }
      );
    }

    // 1. 将 telegramUserId 转换为内部的 users.id (UUID)
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('telegram_id', tgUser.id.toString())
      .maybeSingle();

    if (userError || !user) {
      console.error('User not found:', userError);
      return NextResponse.json(
        { error: 'User not found. Please sync Telegram user first.' },
        { status: 404 }
      );
    }

    // 2. 读取用户持有的宝箱类型和数量
    const { data: userChests, error: chestsError } = await supabase
      .from('user_cases')
      .select('case_id, quantity')
      .eq('user_id', user.id)
      .gt('quantity', 0);

    if (chestsError) {
      console.error('Error fetching chests:', chestsError);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    // 3. 从数据库 cases 表读取宝箱价格（SECURITY: 确保价格与数据库一致）
    const caseIds = (userChests || []).map(c => c.case_id);
    let chestDetails: Record<string, { price: number }> = {};
    
    if (caseIds.length > 0) {
      const { data: casesData, error: casesError } = await supabase
        .from('cases')
        .select('id, price')
        .in('id', caseIds);
      
      if (!casesError && casesData) {
        casesData.forEach(c => {
          chestDetails[c.id] = { price: c.price };
        });
      }
    }

    // 4. 合并用户宝箱数据和数据库价格信息
    const enrichedChests = (userChests || []).map(chest => {
      const config = CHEST_TYPE_CONFIG[chest.case_id] || {
        name: '未知宝箱',
        color: 'from-gray-400 to-gray-600',
        shadow: 'shadow-gray-500/50',
        description: '神秘宝箱',
      };
      const details = chestDetails[chest.case_id] || { price: 0 };
      
      return {
        case_id: chest.case_id,
        quantity: chest.quantity,
        // SECURITY: 价格来自数据库，而非客户端
        price: details.price,
        ...config,
      };
    });

    return NextResponse.json({ success: true, chests: enrichedChests });
  } catch (error: any) {
    if (error?.name === 'ZodError') {
      return NextResponse.json({ error: 'Invalid request payload' }, { status: 400 });
    }
    console.error('Error in chest list route:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
