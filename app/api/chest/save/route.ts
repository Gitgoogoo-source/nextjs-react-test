import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

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
    const { userId: telegramUserId, item } = await request.json();
    
    if (!telegramUserId || !item || !item.id) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

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
      .eq('telegram_id', telegramUserId)
      .maybeSingle();

    if (userError || !user) {
      console.error('User not found:', userError);
      return NextResponse.json(
        { error: 'User not found. Please sync Telegram user first.' },
        { status: 404 }
      );
    }

    // 2. 扣除余额 (假设普通宝箱价格为 100，这里可以根据实际逻辑调整，或者在 open 接口扣除)
    // 注意：在实际商业应用中，扣钱和发货应该在一个事务(Transaction)中完成，或者使用 RPC
    // 这里为了演示，我们简单地在发货时扣除 100 余额
    const newBalance = user.balance - 100;
    if (newBalance < 0) {
      // 余额不足
      // return NextResponse.json({ error: 'Insufficient balance' }, { status: 400 });
      // 考虑到这是测试环境，我们允许负数或者不阻断
    }

    // 更新余额
    const { error: balanceError } = await supabase
      .from('users')
      .update({ balance: newBalance })
      .eq('id', user.id);
    if (balanceError) {
      console.error('Error updating balance:', balanceError);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

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
  } catch (error) {
    console.error('Error in save route:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
