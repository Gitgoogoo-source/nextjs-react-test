import crypto from 'crypto';

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  photo_url?: string;
}

// initData 新鲜度阈值：24 小时。超过此时间的 initData 视为过期，防止重放攻击
const INIT_DATA_MAX_AGE_SECONDS = 24 * 3600;

export function validateTelegramWebAppData(
  telegramInitData: string
): {
  isValid: boolean;
  user?: TelegramUser;
  reason?:
    | 'missing_bot_token'
    | 'missing_hash'
    | 'hash_mismatch'
    | 'invalid_user_json'
    | 'missing_auth_date'
    | 'auth_date_expired';
} {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.error('TELEGRAM_BOT_TOKEN is not set');
    return { isValid: false, reason: 'missing_bot_token' };
  }

  const initData = new URLSearchParams(telegramInitData);
  const hash = initData.get('hash');

  if (!hash) {
    return { isValid: false, reason: 'missing_hash' };
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

  if (calculatedHash !== hash) {
    return { isValid: false, reason: 'hash_mismatch' };
  }

  // 安全：校验 auth_date 新鲜度，防止泄露的 initData 被无限期重放
  const authDateStr = initData.get('auth_date');
  const authDate = Number(authDateStr);
  if (!authDateStr || !Number.isFinite(authDate) || authDate <= 0) {
    return { isValid: false, reason: 'missing_auth_date' };
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (nowSeconds - authDate > INIT_DATA_MAX_AGE_SECONDS) {
    return { isValid: false, reason: 'auth_date_expired' };
  }

  const userStr = initData.get('user');
  if (userStr) {
    try {
      const user = JSON.parse(userStr) as TelegramUser;
      return { isValid: true, user };
    } catch (e) {
      console.error('Failed to parse user data', e);
      return { isValid: false, reason: 'invalid_user_json' };
    }
  }
  return { isValid: true };
}
