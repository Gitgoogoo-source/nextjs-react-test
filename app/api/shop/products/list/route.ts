import { z } from 'zod';
import { jsonActionErr, jsonActionOk } from '@/lib/api-json';
import { createAdminClient } from '@/lib/supabase/admin';
import { validateTelegramWebAppData } from '@/lib/telegram';
import { checkRateLimit, rateLimitExceededResponse, telegramScope } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const listProductsSchema = z.object({
  initData: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { initData } = listProductsSchema.parse(body);

    // 安全：已验证 Telegram initData 防止请求伪造
    const { isValid, user: tgUser } = validateTelegramWebAppData(initData);
    if (!isValid || !tgUser) {
      return jsonActionErr('身份验证失败', 401);
    }

    const supabase = createAdminClient();

    // 限流（30 req/min 粒度）
    const rateLimitResult = await checkRateLimit(supabase, {
      scope: telegramScope(tgUser.id),
      route: 'shop/products/list',
      limit: 30,
      windowSeconds: 60,
    });

    if (!rateLimitResult.allowed) {
      return rateLimitExceededResponse(rateLimitResult);
    }

    // 商品列表只来自 DB（shop_products），前端不允许硬编码商品/价格
    const { data, error } = await supabase
      .from('shop_products')
      .select(
        `
        id,
        product_type,
        title,
        description,
        currency,
        price,
        is_active,
        case_id,
        item_id,
        cases:case_id ( id, name, case_key, price, description ),
        items:item_id ( id, name, rarity, color, border, hex )
      `
      )
      .eq('is_active', true)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching shop products:', error);
      return jsonActionErr('数据库错误', 500);
    }

    return jsonActionOk({ products: data ?? [] });
  } catch (error: unknown) {
    const err = error as { name?: string };
    if (err?.name === 'ZodError') {
      return jsonActionErr('请求参数无效', 400);
    }
    console.error('Error in shop products list route:', error);
    return jsonActionErr('服务器内部错误', 500);
  }
}

