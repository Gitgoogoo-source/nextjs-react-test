'use client';

import { init } from '@telegram-apps/sdk-react';

let didInit = false;

/**
 * 在使用 @telegram-apps/sdk-react 提供的 API（如 postEvent、retrieveRawInitData）前必须初始化。
 * 在 TelegramAuthProvider 首屏渲染时调用，早于子组件中的 SDK 能力。
 */
export function ensureTelegramSdk(): void {
  if (typeof window === 'undefined' || didInit) return;
  didInit = true;
  init();
}
