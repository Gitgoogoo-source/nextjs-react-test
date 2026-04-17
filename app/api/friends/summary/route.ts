import { z } from 'zod';
import { jsonActionErr, jsonActionOk } from '@/lib/api-json';
import { createAdminClient } from '@/lib/supabase/admin';
import { validateTelegramWebAppData } from '@/lib/telegram';
import { checkRateLimit, rateLimitExceededResponse, telegramScope } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const friendsSummaryBodySchema = z.object({
  initData: z.string().min(1, '缺少 initData'),
});

type FriendsSummaryResponse = {
  invitedCount: number;
  rewardTotal: number;
};

export async function POST(request: Request) {
  try {
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return jsonActionErr('请求体无效', 400);
    }

    const parsed = friendsSummaryBodySchema.safeParse(rawBody);
    if (!parsed.success) {
      return jsonActionErr('参数无效', 400);
    }
    const { initData } = parsed.data;

    // 安全：已验证 Telegram initData 防止请求伪造
    const { isValid, user: tgUser } = validateTelegramWebAppData(initData);
    if (!isValid || !tgUser) {
      return jsonActionErr('身份验证失败', 401);
    }

    const supabase = createAdminClient();

    // 限流（30 req/min 粒度）
    const rateLimitResult = await checkRateLimit(supabase, {
      scope: telegramScope(tgUser.id),
      route: 'friends/summary',
      limit: 30,
      windowSeconds: 60,
    });

    if (!rateLimitResult.allowed) {
      return rateLimitExceededResponse(rateLimitResult);
    }

    // 1) 找到当前用户（以 Telegram ID 为准）
    const { data: dbUser, error: userErr } = await supabase
      .from('users')
      .select('id, telegram_id')
      .eq('telegram_id', tgUser.id)
      .maybeSingle();

    if (userErr || !dbUser) {
      return jsonActionErr('用户不存在', 404);
    }

    // 2) 邀请人数：以 user_invites.inviter_user_id 统计（不在前端传 userId，避免篡改）
    const { count: invitedCount, error: inviteCountErr } = await supabase
      .from('user_invites')
      .select('id', { count: 'exact', head: true })
      .eq('inviter_user_id', dbUser.id);

    if (inviteCountErr) {
      console.error('invite count error:', inviteCountErr);
      return jsonActionErr('数据库错误', 500);
    }

    // 3) 奖励总额：仅统计已发放（granted）的数值奖励 amount（item 奖励 amount 可能为空）
    const { data: rewards, error: rewardsErr } = await supabase
      .from('invite_rewards')
      .select('amount, status')
      .eq('inviter_user_id', dbUser.id)
      .eq('status', 'granted');

    if (rewardsErr) {
      console.error('invite rewards error:', rewardsErr);
      return jsonActionErr('数据库错误', 500);
    }

    const rewardTotal = (rewards || []).reduce((acc, r) => acc + Number(r.amount || 0), 0);

    const res: FriendsSummaryResponse = {
      invitedCount: Number(invitedCount || 0),
      rewardTotal,
    };

    return jsonActionOk(res);
  } catch (error) {
    console.error('friends summary error:', error);
    return jsonActionErr('服务器内部错误', 500);
  }
}

