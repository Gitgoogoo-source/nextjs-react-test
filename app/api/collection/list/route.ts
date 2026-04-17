import { z } from 'zod';
import { jsonActionErr, jsonActionOk } from '@/lib/api-json';
import { createAdminClient } from '@/lib/supabase/admin';
import { validateTelegramWebAppData } from '@/lib/telegram';
import { checkRateLimit, rateLimitExceededResponse, telegramScope } from '@/lib/rate-limit';
import type { Database } from '@/types/supabase';

export const dynamic = 'force-dynamic';

/** 与 .select('item_id, quantity') 对齐，来源于 user_items.Row */
type UserItemInventoryRow = Pick<
  Database['public']['Tables']['user_items']['Row'],
  'item_id' | 'quantity'
>;
/** 与 .select('id, name, rarity, color, border, hex') 对齐，来源于 items.Row */
type ItemDisplayRow = Pick<
  Database['public']['Tables']['items']['Row'],
  'id' | 'name' | 'rarity' | 'color' | 'border' | 'hex'
>;

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
      return jsonActionErr('身份验证失败', 401);
    }

    let supabase;
    try {
      supabase = createAdminClient();
    } catch (error) {
      console.error('Error creating admin client:', error);
      return jsonActionErr('服务器配置错误：缺少 SUPABASE_SERVICE_ROLE_KEY', 500);
    }

    // SECURITY: 限流（30 req/min 粒度）
    const rateLimitResult = await checkRateLimit(supabase, {
      scope: telegramScope(tgUser.id),
      route: 'collection/list',
      limit: 30,
      windowSeconds: 60,
    });

    if (!rateLimitResult.allowed) {
      return rateLimitExceededResponse(rateLimitResult);
    }

    // 1) 将 telegramUserId 转换为内部 users.id (UUID)
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('telegram_id', tgUser.id)
      .maybeSingle();

    if (userError || !user) {
      console.error('User not found:', userError);
      return jsonActionErr('用户不存在，请先完成 Telegram 同步', 404);
    }

    // 2) 读取用户持有的藏品数量（只拿 item_id + quantity）
    const { data: userItems, error: userItemsError } = await supabase
      .from('user_items')
      .select('item_id, quantity')
      .eq('user_id', user.id)
      .gt('quantity', 0);

    if (userItemsError) {
      console.error('Error fetching user_items:', userItemsError);
      return jsonActionErr('数据库错误', 500);
    }

    const typedUserItems = (userItems || []) as UserItemInventoryRow[];
    const itemIds = typedUserItems.map((r) => r.item_id).filter(Boolean);

    const itemDetails: Record<string, ItemDisplayRow> = {};
    if (itemIds.length > 0) {
      const { data: itemsData, error: itemsError } = await supabase
        .from('items')
        .select('id, name, rarity, color, border, hex')
        .in('id', itemIds);

      if (itemsError) {
        console.error('Error fetching items:', itemsError);
        return jsonActionErr('数据库错误', 500);
      }

      (itemsData || []).forEach((it) => {
        const row = it as ItemDisplayRow;
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

    return jsonActionOk({ items: enriched });
  } catch (error: unknown) {
    const err = error as { name?: string };
    if (err?.name === 'ZodError') {
      return jsonActionErr('请求参数无效', 400);
    }
    console.error('Error in collection list route:', error);
    return jsonActionErr('服务器内部错误', 500);
  }
}

