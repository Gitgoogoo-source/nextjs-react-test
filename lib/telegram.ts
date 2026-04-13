import crypto from 'crypto';

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  photo_url?: string;
}

export function validateTelegramWebAppData(telegramInitData: string): { isValid: boolean; user?: TelegramUser } {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    // #region agent log
    void fetch('http://127.0.0.1:7350/ingest/1b4a6dd6-a323-4199-9b3b-37ab802be016', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Debug-Session-Id': '3430d0',
      },
      body: JSON.stringify({
        sessionId: '3430d0',
        runId: 'telegram-auth-pre-fix',
        hypothesisId: 'H3',
        location: 'lib/telegram.ts:14',
        message: '服务端缺少 TELEGRAM_BOT_TOKEN',
        data: {
          hasToken: false,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion

    console.error('TELEGRAM_BOT_TOKEN is not set');
    return { isValid: false };
  }

  const initData = new URLSearchParams(telegramInitData);
  const hash = initData.get('hash');
  
  if (!hash) {
    return { isValid: false };
  }

  initData.delete('hash');

  const dataToCheck: string[] = [];
  initData.sort();
  initData.forEach((value, key) => {
    dataToCheck.push(`${key}=${value}`);
  });

  const dataCheckString = dataToCheck.join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
  const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  // #region agent log
  void fetch('http://127.0.0.1:7350/ingest/1b4a6dd6-a323-4199-9b3b-37ab802be016', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Debug-Session-Id': '3430d0',
    },
    body: JSON.stringify({
      sessionId: '3430d0',
      runId: 'telegram-auth-pre-fix',
      hypothesisId: 'H3',
      location: 'lib/telegram.ts:39',
      message: '服务端完成 Telegram 哈希校验计算',
      data: {
        paramsCount: dataToCheck.length,
        hashMatches: calculatedHash === hash,
        hasUserField: initData.has('user'),
        hasStartParam: initData.has('start_param'),
        authDate: initData.get('auth_date') ? 'present' : 'missing',
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

  if (calculatedHash === hash) {
    const userStr = initData.get('user');
    if (userStr) {
      try {
        const user = JSON.parse(userStr) as TelegramUser;
        return { isValid: true, user };
      } catch (e) {
        console.error('Failed to parse user data', e);
      }
    }
    return { isValid: true };
  }

  return { isValid: false };
}
