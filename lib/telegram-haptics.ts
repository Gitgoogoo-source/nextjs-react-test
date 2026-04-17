'use client';

import {
  hapticFeedbackImpactOccurred,
  hapticFeedbackNotificationOccurred,
} from '@telegram-apps/sdk-react';

/** 触感：撞击样式（需已 ensureTelegramSdk） */
export function telegramHapticImpact(
  style: Parameters<typeof hapticFeedbackImpactOccurred>[0]
): void {
  hapticFeedbackImpactOccurred.ifAvailable(style);
}

/** 触感：通知类（成功/错误/警告） */
export function telegramHapticNotify(
  type: Parameters<typeof hapticFeedbackNotificationOccurred>[0]
): void {
  hapticFeedbackNotificationOccurred.ifAvailable(type);
}
