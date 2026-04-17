import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { validateTelegramWebAppData } from '@/lib/telegram';
import { checkRateLimit, rateLimitExceededResponse, telegramScope } from '@/lib/rate-limit';

const listProductsSchema = z.object({
  initData: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { initData } = listProductsSchema.parse(body);

    // SECURITY: 服务端校验 Telegram initData，拒绝伪造 userId（即使只是读接口也按公开端点处理）
    const { isValid, user: tgUser } = validateTelegramWebAppData(initData);
    if (!isValid || !tgUser) {
      return NextResponse.json({ error: '身份验证失败' }, { status: 401 });
    }

    const supabase = createAdminClient();

    // SECURITY: 限流（30 req/min 粒度）
    const rateLimitResult = await checkRateLimit(supabase, {
      scope: telegramScope(tgUser.id),
      route: 'shop/products/list',
      limit: 30,
      windowSeconds: 60,
    });

    if (!rateLimitResult.allowed) {
      return rateLimitExceededResponse(rateLimitResult);
    }

    // SECURITY: 商品列表只来自 DB（shop_products），前端不允许硬编码商品/价格
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
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    return NextResponse.json({ success: true, products: data ?? [] });
  } catch (error: unknown) {
    const err = error as { name?: string };
    if (err?.name === 'ZodError') {
      return NextResponse.json({ error: 'Invalid request payload' }, { status: 400 });
    }
    console.error('Error in shop products list route:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

