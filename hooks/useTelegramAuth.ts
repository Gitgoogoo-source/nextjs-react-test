'use client';

import { useEffect, useState } from 'react';
import { syncUserAssets } from '@/actions/asset-actions'; // 使用新的资产同步 Action
import { useUserStore } from '@/store/useUserStore';   // 使用 Zustand Store
import { retrieveLaunchParams } from '@telegram-apps/sdk';
import { TelegramUser } from '@/lib/telegram';

export function useTelegramAuth() {
  const { isSyncing: storeSyncing, sync: syncStore, error: storeError } = useUserStore();
  const [isInitializing, setIsInitializing] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<TelegramUser | null>(null);

  useEffect(() => {
    async function init() {
      try {
        if (typeof window === 'undefined') return;

        let initData = '';
        let parsedUser: TelegramUser | null = null;

        // 尝试获取 Telegram initData
        try {
          const launchParams = retrieveLaunchParams();
          // SDK 的类型可能把 initDataRaw 标成 {}，这里做严格处理以通过 TS build
          const anyLp = launchParams as any;
          const raw = anyLp?.initDataRaw;
          if (typeof raw === 'string') initData = raw;
          else if (raw != null) initData = String(raw);
          // UI 用用户信息（不用于鉴权）
          // SECURITY: 前端拿到的 user 仅用于展示；所有敏感操作仍需服务端校验 initData 防止伪造
          if (anyLp?.initData?.user) {
            parsedUser = anyLp.initData.user as TelegramUser;
          }
        } catch (e) {
          const win = window as any;
          if (win.Telegram?.WebApp?.initData) {
            initData = win.Telegram.WebApp.initData;
          }
        }

        if (!initData) {
          if (process.env.NODE_ENV === 'development') {
            setIsInitializing(false);
            return;
          }
          setError('请在 Telegram 中打开此应用');
          setIsInitializing(false);
          return;
        }

        // 从 initData 中解析 user（用于 UI 展示）
        // SECURITY: 解析出来的 user 只做 UI，不作为身份凭据；身份以服务端 validateTelegramWebAppData 为准
        if (!parsedUser) {
          try {
            const params = new URLSearchParams(initData);
            const userStr = params.get('user');
            if (userStr) {
              parsedUser = JSON.parse(userStr) as TelegramUser;
            }
          } catch (e) {
            // ignore
          }
        }
        setUser(parsedUser);

        // 调用 Zustand Store 的 sync 方法，它内部会调用 syncUserAssets 并更新状态
        await syncStore(initData);
        
      } catch (err) {
        console.error('Initialization error:', err);
        setError('初始化失败');
      } finally {
        setIsInitializing(false);
      }
    }

    init();
  }, [syncStore]);

  return { 
    user,
    isSyncing: isInitializing || storeSyncing, 
    error: error || storeError 
  };
}
