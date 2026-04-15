import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { validateTelegramWebAppData } from '@/lib/telegram';
import { z } from 'zod';

// 映射前端的 mock ID 到数据库的 UUID
const ITEM_ID_MAP: Record<number, string> = {
  1: '11111111-1111-1111-1111-111111111111',
  2: '22222222-2222-2222-2222-222222222222',
  3: '33333333-3333-3333-3333-333333333333',
  4: '44444444-4444-4444-4444-444444444444',
  5: '55555555-5555-5555-5555-555555555555',
};

const saveSchema = z.object({
  // 兼容旧前端：仍然可能传 userId，但服务端不信任它
  userId: z.any().optional(),
  initData: z.string().min(1),
  item: z.object({
    id: z.number().int(),
  }),
});

export async function POST(request: Request) {
  try {
    // SECURITY: 本接口属于旧逻辑（硬编码扣费 100），为避免错账与被滥用，强制要求 initData 并仅用于“发货兜底”
    const body = await request.json();
    const { initData, item } = saveSchema.parse(body);

    const { isValid, user: tgUser } = validateTelegramWebAppData(initData);
    if (!isValid || !tgUser) {
      return NextResponse.json({ error: '身份验证失败' }, { status: 401 });
    }
    
    if (!item?.id) return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });

    // 注意：当前数据库开启了 RLS，但未配置 users/user_items 的策略。
    // 因此服务端写入必须使用 service role（管理员客户端）绕过 RLS。
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

    const itemUuid = ITEM_ID_MAP[item.id];
    if (!itemUuid) {
      return NextResponse.json({ error: 'Invalid item ID' }, { status: 400 });
    }

    // 1. 将 telegramUserId 转换为内部的 users.id (UUID)
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, balance')
      .eq('telegram_id', tgUser.id.toString())
      .maybeSingle();

    if (userError || !user) {
      console.error('User not found:', userError);
      return NextResponse.json(
        { error: 'User not found. Please sync Telegram user first.' },
        { status: 404 }
      );
    }

    // SECURITY: 禁用旧的“硬编码扣费”逻辑，避免错账/被利用；只做物品入库兜底

    // 3. 写入用户的 user_items 表
    // 先查询是否已有该物品
    const { data: userItem, error: userItemError } = await supabase
      .from('user_items')
      .select('id, quantity')
      .eq('user_id', user.id)
      .eq('item_id', itemUuid)
      .maybeSingle();

    if (userItemError) {
      console.error('Error fetching user_items:', userItemError);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    let data, error;
    if (userItem) {
      // 更新数量
      const updateResult = await supabase
        .from('user_items')
        .update({ quantity: userItem.quantity + 1, updated_at: new Date().toISOString() })
        .eq('id', userItem.id)
        .select()
        .single();
      data = updateResult.data;
      error = updateResult.error;
    } else {
      // 插入新记录
      const insertResult = await supabase
        .from('user_items')
        .insert({
          user_id: user.id,
          item_id: itemUuid,
          quantity: 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();
      data = insertResult.data;
      error = insertResult.error;
    }

    if (error) {
      console.error('Error saving to user_items:', error);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    if (error?.name === 'ZodError') {
      return NextResponse.json({ error: 'Invalid request payload' }, { status: 400 });
    }
    console.error('Error in save route:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
