import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { validateTelegramWebAppData } from '@/lib/telegram';

export const dynamic = 'force-dynamic';

type PreparedMessageResponse = {
  msgId: string;
};

function getEnv(name: string) {
  const v = process.env[name];
  return typeof v === 'string' && v.length > 0 ? v : null;
}

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

    const botToken = getEnv('TELEGRAM_BOT_TOKEN');
    const botUsername = getEnv('NEXT_PUBLIC_TELEGRAM_BOT_USERNAME');
    if (!botToken || !botUsername) {
      return NextResponse.json({ error: 'Bot 未配置' }, { status: 500 });
    }

    const supabase = createAdminClient();

    // 1) 找到当前用户（inviter）
    const { data: dbUser, error: userErr } = await supabase
      .from('users')
      .select('id, telegram_id, first_name')
      .eq('telegram_id', tgUser.id)
      .maybeSingle();

    if (userErr || !dbUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // 2) 命中缓存则直接返回（避免频繁调用 Bot API）
    const { data: cached, error: cacheErr } = await supabase
      .from('user_prepared_messages')
      .select('msg_id')
      .eq('user_id', dbUser.id)
      .eq('kind', 'invite')
      .maybeSingle();

    if (cacheErr) {
      console.error('prepared msg cache error:', cacheErr);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    if (cached?.msg_id) {
      const res: PreparedMessageResponse = { msgId: String(cached.msg_id) };
      return NextResponse.json(res);
    }

    // 3) 生成 startapp 深链接（归因用）
    const startParam = `ref_${tgUser.id}`;
    const inviteLink = `https://t.me/${botUsername}?startapp=${encodeURIComponent(startParam)}`;

    // 4) 调 Bot API 生成 PreparedInlineMessage（msg_id）
    // 参考：savePreparedInlineMessage(user_id, result: InlineQueryResult)
    const messageText = `🎁 邀请你加入游戏！\n\n点击下方按钮进入并领取奖励：\n${inviteLink}`;

    const payload = {
      user_id: tgUser.id,
      result: {
        type: 'article',
        id: crypto.randomUUID(),
        title: '邀请好友一起玩',
        input_message_content: {
          message_text: messageText,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        },
        reply_markup: {
          inline_keyboard: [[{ text: '立即加入', url: inviteLink }]],
        },
      },
    };

    const apiUrl = `https://api.telegram.org/bot${botToken}/savePreparedInlineMessage`;
    const tgRes = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
    });

    const tgJson = (await tgRes.json().catch(() => null)) as unknown;
    if (!tgRes.ok || !tgJson || typeof tgJson !== 'object') {
      console.error('telegram savePreparedInlineMessage failed:', tgRes.status, tgJson);
      return NextResponse.json({ error: 'Telegram API error' }, { status: 502 });
    }

    const ok = (tgJson as { ok?: unknown }).ok === true;
    const msgId = ok ? (tgJson as { result?: { id?: unknown } }).result?.id : null;
    if (!ok || typeof msgId !== 'string' || msgId.length === 0) {
      console.error('telegram savePreparedInlineMessage bad response:', tgJson);
      return NextResponse.json({ error: 'Telegram API error' }, { status: 502 });
    }

    // 5) 写缓存（幂等：UNIQUE(user_id, kind)）
    const { error: upsertErr } = await supabase.from('user_prepared_messages').upsert(
      {
        user_id: dbUser.id,
        kind: 'invite',
        msg_id: msgId,
      },
      { onConflict: 'user_id,kind' }
    );

    if (upsertErr) {
      console.error('prepared msg upsert error:', upsertErr);
      // 缓存失败不影响返回 msg_id
    }

    const res: PreparedMessageResponse = { msgId };
    return NextResponse.json(res);
  } catch (error) {
    console.error('prepared-message error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

