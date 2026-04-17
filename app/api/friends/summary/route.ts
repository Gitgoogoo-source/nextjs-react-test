import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { validateTelegramWebAppData } from '@/lib/telegram';
import { checkRateLimit, rateLimitExceededResponse, telegramScope } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

type FriendsSummaryResponse = {
  invitedCount: number;
  rewardTotal: number;
};

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json().catch(() => null);
    const initData =
      body && typeof body === 'object' && 'initData' in body && typeof (body as { initData?: unknown }).initData === 'string'
        ? (body as { initData: string }).initData
        : '';

    if (!initData) {
      return NextResponse.json({ error: '缺少 initData' }, { status: 400 });
    }

    // SECURITY: 服务端校验 Telegram initData，拒绝伪造身份
    const { isValid, user: tgUser } = validateTelegramWebAppData(initData);
    if (!isValid || !tgUser) {
      return NextResponse.json({ error: '身份验证失败' }, { status: 401 });
    }

    const supabase = createAdminClient();

    // SECURITY: 限流（30 req/min 粒度）
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
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // 2) 邀请人数：以 user_invites.inviter_user_id 统计（不在前端传 userId，避免篡改）
    const { count: invitedCount, error: inviteCountErr } = await supabase
      .from('user_invites')
      .select('id', { count: 'exact', head: true })
      .eq('inviter_user_id', dbUser.id);

    if (inviteCountErr) {
      console.error('invite count error:', inviteCountErr);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    // 3) 奖励总额：仅统计已发放（granted）的数值奖励 amount（item 奖励 amount 可能为空）
    const { data: rewards, error: rewardsErr } = await supabase
      .from('invite_rewards')
      .select('amount, status')
      .eq('inviter_user_id', dbUser.id)
      .eq('status', 'granted');

    if (rewardsErr) {
      console.error('invite rewards error:', rewardsErr);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    const rewardTotal = (rewards || []).reduce((acc, r) => acc + Number(r.amount || 0), 0);

    const res: FriendsSummaryResponse = {
      invitedCount: Number(invitedCount || 0),
      rewardTotal,
    };

    return NextResponse.json(res);
  } catch (error) {
    console.error('friends summary error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

