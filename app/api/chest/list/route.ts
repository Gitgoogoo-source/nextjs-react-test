import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const telegramUserId = searchParams.get('userId');

    if (!telegramUserId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
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
      .eq('telegram_id', telegramUserId)
      .maybeSingle();

    if (userError || !user) {
      console.error('User not found:', userError);
      return NextResponse.json(
        { error: 'User not found. Please sync Telegram user first.' },
        { status: 404 }
      );
    }

    // 2. 读取用户持有的宝箱类型和数量
    // 表名为 user_cases，包含 user_id, case_id, quantity
    const { data: chests, error: chestsError } = await supabase
      .from('user_cases')
      .select('case_id, quantity')
      .eq('user_id', user.id);

    if (chestsError) {
      console.error('Error fetching chests:', chestsError);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    return NextResponse.json({ success: true, chests: chests || [] });
  } catch (error) {
    console.error('Error in chest list route:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
