import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { validateTelegramWebAppData } from '@/lib/telegram';

interface UserItemRow {
  item_id: string;
  quantity: number;
}

interface ItemRow {
  id: string;
  name: string;
  rarity: string;
  color: string;
  border: string;
  hex: string;
}

const listCollectionSchema = z.object({
  initData: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { initData } = listCollectionSchema.parse(body);

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

    // 1) 将 telegramUserId 转换为内部 users.id (UUID)
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('telegram_id', tgUser.id)
      .maybeSingle();

    if (userError || !user) {
      console.error('User not found:', userError);
      return NextResponse.json(
        { error: 'User not found. Please sync Telegram user first.' },
        { status: 404 }
      );
    }

    // 2) 读取用户持有的藏品数量（只拿 item_id + quantity）
    const { data: userItems, error: userItemsError } = await supabase
      .from('user_items')
      .select('item_id, quantity')
      .eq('user_id', user.id)
      .gt('quantity', 0);

    if (userItemsError) {
      console.error('Error fetching user_items:', userItemsError);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    const typedUserItems = (userItems || []) as UserItemRow[];
    const itemIds = typedUserItems.map((r) => r.item_id).filter(Boolean);

    const itemDetails: Record<string, ItemRow> = {};
    if (itemIds.length > 0) {
      const { data: itemsData, error: itemsError } = await supabase
        .from('items')
        .select('id, name, rarity, color, border, hex')
        .in('id', itemIds);

      if (itemsError) {
        console.error('Error fetching items:', itemsError);
        return NextResponse.json({ error: 'Database error' }, { status: 500 });
      }

      (itemsData || []).forEach((it) => {
        const row = it as ItemRow;
        itemDetails[row.id] = row;
      });
    }

    // 3) 合并：以 DB 为准，前端只负责展示
    const enriched = typedUserItems
      .map((ui) => {
        const details = itemDetails[ui.item_id];
        if (!details) return null;
        return {
          item_id: ui.item_id,
          quantity: Number(ui.quantity) || 0,
          name: details.name,
          rarity: details.rarity,
          color: details.color,
          border: details.border,
          hex: details.hex,
        };
      })
      .filter(Boolean);

    return NextResponse.json({ success: true, items: enriched });
  } catch (error: unknown) {
    const err = error as { name?: string };
    if (err?.name === 'ZodError') {
      return NextResponse.json({ error: 'Invalid request payload' }, { status: 400 });
    }
    console.error('Error in collection list route:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

