import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { validateTelegramWebAppData } from '@/lib/telegram';

// SECURITY: 购买会改变资产/库存，必须禁用 Next.js 缓存，确保每次请求都走真实后端逻辑
export const dynamic = 'force-dynamic';

const purchaseSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().min(1).max(100),
  // 幂等键：断网/超时/重试不会重复扣款/重复发货
  requestId: z.string().uuid().optional(),
  initData: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { productId, quantity, requestId, initData } = purchaseSchema.parse(body);

    // SECURITY: 服务端校验 Telegram initData，拒绝伪造 userId
    const { isValid, user: tgUser } = validateTelegramWebAppData(initData);
    if (!isValid || !tgUser) {
      return NextResponse.json({ error: '身份验证失败' }, { status: 401 });
    }

    const supabase = createAdminClient();

    // SECURITY: 服务器端把 telegram_id 映射到内部 users.id（不信任前端传 userId）
    const { data: dbUser, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('telegram_id', tgUser.id.toString())
      .maybeSingle();

    if (userError || !dbUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const effectiveRequestId = requestId ?? crypto.randomUUID();

    // SECURITY: 购买的价格/币种/上下架状态全部由 DB 内 shop_products 决定
    // SECURITY: 原子性/一致性/幂等由 DB 函数 shop_purchase 保证（行级锁 + UNIQUE(user_id, request_id)）
    const { data: rpcData, error: rpcError } = await supabase.rpc('shop_purchase', {
      p_user_id: dbUser.id,
      p_product_id: productId,
      p_quantity: quantity,
      p_request_id: effectiveRequestId,
    });

    if (rpcError) {
      const msg = rpcError.message || '';
      if (msg.includes('Insufficient balance')) {
        return NextResponse.json({ error: 'Insufficient balance' }, { status: 400 });
      }
      if (msg.includes('Insufficient stars')) {
        return NextResponse.json({ error: 'Insufficient stars' }, { status: 400 });
      }
      if (msg.includes('Product not found')) {
        return NextResponse.json({ error: 'Product not found' }, { status: 404 });
      }
      if (msg.includes('Invalid quantity')) {
        return NextResponse.json({ error: 'Invalid quantity' }, { status: 400 });
      }
      console.error('shop_purchase rpc error:', rpcError);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      result: rpcData,
    });
  } catch (error: unknown) {
    const err = error as { name?: string };
    if (err?.name === 'ZodError') {
      return NextResponse.json({ error: 'Invalid request payload' }, { status: 400 });
    }
    console.error('Error in shop purchase route:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

