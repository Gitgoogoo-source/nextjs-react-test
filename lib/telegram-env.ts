'use client';

import { isTMA } from '@telegram-apps/sdk-react';

/** 是否在 Telegram Mini App 环境（不经 window.Telegram.WebApp） */
export function isTelegramWebApp(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return isTMA();
  } catch {
    return false;
  }
}
