'use client';

import { useEffect, useState } from 'react';
import { useUserStore } from '@/store/useUserStore';   // 使用 Zustand Store
import { retrieveLaunchParams } from '@telegram-apps/sdk';
import { TelegramUser } from '@/lib/telegram';
import { useChestStore } from '@/store/useChestStore';
import { useCollectionStore } from '@/store/useCollectionStore';

export function useTelegramAuth() {
  const { isSyncing: storeSyncing, sync: syncStore, error: storeError } = useUserStore();
  const [isInitializing, setIsInitializing] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<TelegramUser | null>(null);

  useEffect(() => {
    async function init() {
      try {
        if (typeof window === 'undefined') return;

        // 避免在多个组件里重复触发“全量同步”导致循环 loading：
        // Provider 首次同步成功后，store 里已有 initData，其它组件再 mount 时应只读取状态，不要再 sync 一遍。
        const existingInitData = useUserStore.getState().initData;

        let initData = '';
        let parsedUser: TelegramUser | null = null;

        // 尝试获取 Telegram initData
        try {
          const launchParams = retrieveLaunchParams();
          // Telegram SDK 的字段名叫 initDataRaw（字符串）；业务层统一称其为 initData
          const lp = launchParams as unknown as {
            initDataRaw?: unknown;
            initData?: { user?: unknown };
          };
          const launchParamsInitDataRaw = lp?.initDataRaw;
          if (typeof launchParamsInitDataRaw === 'string') initData = launchParamsInitDataRaw;
          else if (launchParamsInitDataRaw != null) initData = String(launchParamsInitDataRaw);
          // UI 用用户信息（不用于鉴权）
          // SECURITY: 前端拿到的 user 仅用于展示；所有敏感操作仍需服务端校验 initData 防止伪造
          if (lp?.initData?.user) {
            parsedUser = lp.initData.user as TelegramUser;
          }
        } catch {
          // ignore and fallback to window.Telegram below
        }

        // 兜底：即使 retrieveLaunchParams 成功但 initDataRaw 为空，也要再从 Telegram WebApp 取一次
        // SECURITY: initData 仅作为服务端验签输入，服务端会校验签名防止伪造
        if (!initData) {
          const win = window as unknown as {
            Telegram?: { WebApp?: { initData?: unknown } };
          };
          const rawInitData = win.Telegram?.WebApp?.initData;
          if (typeof rawInitData === 'string' && rawInitData.length > 0) {
            initData = rawInitData;
          }
        }

        // 如果 store 已经有 initData（通常来自 TelegramAuthProvider 的首次同步），就不要再次触发 syncStore
        if (existingInitData) {
          // 仍然尝试解析 user 供 UI 展示（不作为鉴权凭据）
          if (!parsedUser) {
            try {
              const params = new URLSearchParams(existingInitData);
              const userStr = params.get('user');
              if (userStr) parsedUser = JSON.parse(userStr) as TelegramUser;
            } catch {
              // ignore
            }
          }
          setUser(parsedUser);
          return;
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
          } catch {
            // ignore
          }
        }
        setUser(parsedUser);

        // 调用 Zustand Store 的 sync 方法，它内部会调用 syncUserAssets 并更新状态
        await syncStore(initData);

        // 登录成功后，只执行一次“从后端获取用户宝箱数据”
        // SECURITY: 仅使用 initData 作为服务端验签输入，避免前端伪造 userId
        await useChestStore.getState().loadOnce(initData);

        // 登录成功后，只执行一次“从后端获取用户藏品数据”
        // SECURITY: 仅使用 initData 作为服务端验签输入，避免前端伪造 userId
        await useCollectionStore.getState().loadOnce(initData);
        
      } catch (err: unknown) {
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
