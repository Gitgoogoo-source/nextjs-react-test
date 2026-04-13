'use client';

import { useEffect, useState } from 'react';
import { syncTelegramUser } from '@/app/actions/auth';
import { retrieveLaunchParams } from '@telegram-apps/sdk';
import { TelegramUser } from '@/lib/telegram';

export function useTelegramAuth() {
  const [isSyncing, setIsSyncing] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<TelegramUser | null>(null);

  useEffect(() => {
    async function sync() {
      try {
        if (typeof window === 'undefined') {
          return;
        }

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
            hypothesisId: 'H1',
            location: 'hooks/useTelegramAuth.ts:16',
            message: '客户端开始同步 Telegram 鉴权',
            data: {
              hasTelegramObject: Boolean((window as { Telegram?: unknown }).Telegram),
              hasWebApp: Boolean(
                (window as { Telegram?: { WebApp?: unknown } }).Telegram?.WebApp
              ),
              userAgent: navigator.userAgent.includes('Telegram') ? 'telegram-like' : 'other',
            },
            timestamp: Date.now(),
          }),
        }).catch(() => {});
        // #endregion

        let initData = '';
        let initDataSource: 'sdk' | 'window' | 'none' = 'none';

        // 尝试从 @telegram-apps/sdk 获取
        try {
          const launchParams = retrieveLaunchParams();
          if (launchParams && launchParams.initDataRaw) {
            initData = launchParams.initDataRaw as string;
            initDataSource = 'sdk';
          }
        } catch (e) {
          console.warn('无法从 @telegram-apps/sdk 获取启动参数', e);
        }

        // 降级尝试从 window.Telegram.WebApp 获取
        const win = window as unknown as { Telegram?: { WebApp?: { initData?: string } } };
        if (!initData && win.Telegram?.WebApp?.initData) {
          initData = win.Telegram.WebApp.initData;
          initDataSource = 'window';
        }

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
            hypothesisId: 'H1',
            location: 'hooks/useTelegramAuth.ts:44',
            message: '客户端拿到 initData 结果',
            data: {
              source: initDataSource,
              initDataLength: initData.length,
              hasHash: initData.includes('hash='),
              hasUser: initData.includes('user='),
              hasAuthDate: initData.includes('auth_date='),
            },
            timestamp: Date.now(),
          }),
        }).catch(() => {});
        // #endregion

        if (!initData) {
          console.warn('不在 Telegram 环境中或 initData 为空');
          // 在开发环境中跳过验证
          if (process.env.NODE_ENV === 'development') {
            console.log('开发环境跳过 Telegram 登录验证');
            setIsSyncing(false);
            return;
          }
          setError('请在 Telegram 中打开此应用');
          setIsSyncing(false);
          return;
        }

        // 调用 Server Action 进行后端验证和数据库同步
        const result = await syncTelegramUser(initData);

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
            hypothesisId: 'H2',
            location: 'hooks/useTelegramAuth.ts:74',
            message: '客户端收到同步结果',
            data: {
              success: result.success,
              error: result.error ?? null,
              hasUser: Boolean(result.user),
            },
            timestamp: Date.now(),
          }),
        }).catch(() => {});
        // #endregion

        if (result.success && result.user) {
          setUser(result.user);
        } else {
          setError(result.error || '同步用户数据失败');
        }
      } catch (err) {
        console.error('同步错误:', err);
        setError('发生未知错误');
      } finally {
        setIsSyncing(false);
      }
    }

    sync();
  }, []);

  return { isSyncing, error, user };
}
