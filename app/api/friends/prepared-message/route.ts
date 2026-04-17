import crypto from 'crypto';
import { z } from 'zod';
import { jsonActionErr, jsonActionOk } from '@/lib/api-json';
import { revalidateGameRoot } from '@/lib/revalidate-game';
import { createAdminClient } from '@/lib/supabase/admin';
import { validateTelegramWebAppData } from '@/lib/telegram';
import { checkRateLimit, rateLimitExceededResponse, telegramScope } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const preparedMessageBodySchema = z.object({
  initData: z.string().min(1, '缺少 initData'),
});

type PreparedMessageResponse = {
  msgId: string;
};

function getEnv(name: string) {
  const v = process.env[name];
  return typeof v === 'string' && v.length > 0 ? v : null;
}

export async function POST(request: Request) {
  try {
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return jsonActionErr('请求体无效', 400);
    }

    const parsed = preparedMessageBodySchema.safeParse(rawBody);
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

    // SECURITY: 限流（此端点调用 Telegram Bot API，配额需保护）
    // 5 req/min 粒度
    const rateLimitResult = await checkRateLimit(supabase, {
      scope: telegramScope(tgUser.id),
      route: 'friends/prepared-message',
      limit: 5,
      windowSeconds: 60,
    });

    if (!rateLimitResult.allowed) {
      return rateLimitExceededResponse(rateLimitResult);
    }

    const botToken = getEnv('TELEGRAM_BOT_TOKEN');
    const botUsername = getEnv('NEXT_PUBLIC_TELEGRAM_BOT_USERNAME');
    if (!botToken || !botUsername) {
      return jsonActionErr('Bot 未配置', 500);
    }

    // 1) 找到当前用户（inviter）
    const { data: dbUser, error: userErr } = await supabase
      .from('users')
      .select('id, telegram_id, first_name')
      .eq('telegram_id', tgUser.id)
      .maybeSingle();

    if (userErr || !dbUser) {
      return jsonActionErr('用户不存在', 404);
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
      return jsonActionErr('数据库错误', 500);
    }

    if (cached?.msg_id) {
      const res: PreparedMessageResponse = { msgId: String(cached.msg_id) };
      return jsonActionOk(res);
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
      return jsonActionErr('Telegram API 调用失败', 502);
    }

    const ok = (tgJson as { ok?: unknown }).ok === true;
    const msgId = ok ? (tgJson as { result?: { id?: unknown } }).result?.id : null;
    if (!ok || typeof msgId !== 'string' || msgId.length === 0) {
      console.error('telegram savePreparedInlineMessage bad response:', tgJson);
      return jsonActionErr('Telegram API 调用失败', 502);
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

    revalidateGameRoot();

    const res: PreparedMessageResponse = { msgId };
    return jsonActionOk(res);
  } catch (error) {
    console.error('prepared-message error:', error);
    return jsonActionErr('服务器内部错误', 500);
  }
}

