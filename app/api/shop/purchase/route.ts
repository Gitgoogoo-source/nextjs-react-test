import { z } from 'zod';
import { jsonActionErr, jsonActionErrData, jsonActionOk } from '@/lib/api-json';
import { revalidateGameRoot } from '@/lib/revalidate-game';
import { createAdminClient } from '@/lib/supabase/admin';
import { validateTelegramWebAppData } from '@/lib/telegram';
import { checkRateLimit, rateLimitExceededResponse, telegramScope } from '@/lib/rate-limit';

// 购买会改变资产/库存，必须禁用 Next.js 缓存，确保每次请求都走真实后端逻辑
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

    // 安全：已验证 Telegram initData 防止请求伪造
    const { isValid, user: tgUser } = validateTelegramWebAppData(initData);
    if (!isValid || !tgUser) {
      return jsonActionErr('身份验证失败，请在 Telegram 内重新打开小游戏', 401);
    }

    const supabase = createAdminClient();

    // 限流（20 req/min 粒度，保护 shop_purchase RPC 与 DB）
    const rateLimitResult = await checkRateLimit(supabase, {
      scope: telegramScope(tgUser.id),
      route: 'shop/purchase',
      limit: 20,
      windowSeconds: 60,
    });

    if (!rateLimitResult.allowed) {
      return rateLimitExceededResponse(rateLimitResult);
    }

    // 服务器端把 telegram_id 映射到内部 users.id（不信任前端传 userId）
    const { data: dbUser, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('telegram_id', tgUser.id)
      .maybeSingle();

    if (userError || !dbUser) {
      return jsonActionErr('用户不存在，请重新登录', 404);
    }

    const effectiveRequestId = requestId ?? crypto.randomUUID();

    // 购买的价格/币种/上下架状态全部由 DB 内 shop_products 决定
    // 原子性/一致性/幂等由 DB 函数 shop_purchase 保证（行级锁 + UNIQUE(user_id, request_id)）
    const { data: rpcData, error: rpcError } = await supabase.rpc('shop_purchase', {
      p_user_id: dbUser.id,
      p_product_id: productId,
      p_quantity: quantity,
      p_request_id: effectiveRequestId,
    });

    if (rpcError) {
      const msg = rpcError.message || '';
      if (msg.includes('Insufficient balance')) {
        return jsonActionErr('叶子不足', 400);
      }
      if (msg.includes('Insufficient stars')) {
        return jsonActionErr('星星不足', 400);
      }
      if (msg.includes('Product not found')) {
        return jsonActionErr('商品不存在或已下架', 404);
      }
      if (msg.includes('Invalid quantity')) {
        return jsonActionErr('购买数量不合法', 400);
      }
      console.error('shop_purchase rpc error:', rpcError);
      return jsonActionErr('服务器内部错误', 500);
    }

    // rpcData 是 DB 函数返回的 json；需要把“幂等已处理/失败”等结果显式转换，避免前端静默成功
    const payload = rpcData as unknown as {
      success?: boolean;
      already_processed?: boolean;
      status?: 'pending' | 'succeeded' | 'failed';
      assets?: { balance?: number; stars?: number } | null;
    };

    // 幂等冲突：如果已处理过，返回当前资产快照（200），避免弱网重试造成“无反应”
    if (payload?.already_processed) {
      const { data: assetsRow, error: assetsErr } = await supabase
        .from('users')
        .select('balance, stars')
        .eq('id', dbUser.id)
        .maybeSingle();
      if (assetsErr) {
        console.error('Failed to fetch assets after idempotent purchase:', assetsErr);
      }

      const assets = assetsRow
        ? { balance: Number(assetsRow.balance ?? 0), stars: Number(assetsRow.stars ?? 0) }
        : undefined;

      if (payload?.success || payload?.status === 'succeeded') {
        revalidateGameRoot();
        return jsonActionOk({ ...payload, assets });
      }

      // 已处理但失败：返回 400，让前端能明确提示
      return jsonActionErrData('该订单已处理但未成功，请稍后重试', 400, { ...payload, assets });
    }

    if (!payload?.success) {
      return jsonActionErrData('购买失败，请稍后重试', 400, payload);
    }

    revalidateGameRoot();

    return jsonActionOk(payload);
  } catch (error: unknown) {
    const err = error as { name?: string };
    if (err?.name === 'ZodError') {
      return jsonActionErr('请求参数无效', 400);
    }
    console.error('Error in shop purchase route:', error);
    return jsonActionErr('服务器内部错误', 500);
  }
}
