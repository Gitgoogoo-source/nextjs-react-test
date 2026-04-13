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
