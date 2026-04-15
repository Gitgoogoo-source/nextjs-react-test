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

  useEffect(() => {
    async function init() {
      try {
        if (typeof window === 'undefined') return;

        let initData = '';

        // 尝试获取 Telegram initData
        try {
          const launchParams = retrieveLaunchParams();
          if (launchParams?.initDataRaw) {
            initData = launchParams.initDataRaw;
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
    isSyncing: isInitializing || storeSyncing, 
    error: error || storeError 
  };
}
