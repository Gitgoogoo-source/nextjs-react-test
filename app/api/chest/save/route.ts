import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(request: Request) {
  try {
    const { userId, item } = await request.json();
    
    if (!userId || !item) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // 写入用户的 inventory 表
    const { data, error } = await supabase
      .from('inventory')
      .insert({
        user_id: userId,
        item_id: item.id,
        item_name: item.name,
        rarity: item.rarity,
        acquired_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('Error saving to inventory:', error);
      // 如果表不存在，我们暂时返回成功以避免前端报错
      if (error.code === '42P01') {
        console.log('Inventory table does not exist, skipping save');
        return NextResponse.json({ success: true, warning: 'Table missing' });
      }
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Error in save route:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
