import { create } from "zustand";
import { syncUserAssets, processAssetChange } from "@/actions/asset-actions";

interface UserState {
  balance: number;
  stars: number;
  initData: string | null;
  isSyncing: boolean;
  error: string | null;

  // 全量同步
  sync: (initData: string) => Promise<void>;

  // 静默同步：不触发全局 isSyncing（用于开箱动画期间后台刷新，避免“同步数据中”提示）
  syncSilent: (initData: string) => Promise<void>;

  // 服务端回传的可信资产写回（用于开箱等链路，避免 UI 不刷新）
  setAssetsFromServer: (assets: { balance: number; stars: number }) => void;

  // 执行资产交易 (带乐观更新和回滚)
  updateAssets: (
    initData: string,
    params: { amount: number; type: "balance" | "stars"; reason: string }
  ) => Promise<void>;
}

export const useUserStore = create<UserState>((set, get) => ({
  balance: 0,
  stars: 0,
  initData: null,
  isSyncing: false,
  error: null,

  setAssetsFromServer: (assets) => {
    set({
      balance: Number(assets.balance) || 0,
      stars: Number(assets.stars) || 0,
    });
  },

  sync: async (initData) => {
    set({ isSyncing: true, error: null, initData });
    try {
      // 防止网络/后端卡死导致无限 loading
      const response = await Promise.race([
        syncUserAssets(initData),
        new Promise<{ success: false; error: string }>((resolve) =>
          setTimeout(() => resolve({ success: false, error: '同步超时，请重试' }), 12_000)
        ),
      ]);
      if (response.success && response.data) {
        get().setAssetsFromServer({
          balance: Number(response.data.balance),
          stars: Number(response.data.stars),
        });
        return;
      }
      set({ error: response.error || "同步失败" });
    } catch (err: unknown) {
      console.error("Store sync error:", err);
      const message =
        typeof err === 'object' && err !== null && 'message' in err
          ? String((err as { message?: unknown }).message || '同步失败')
          : '同步失败';
      set({ error: message });
    } finally {
      set({ isSyncing: false });
    }
  },

  syncSilent: async (initData) => {
    // SECURITY: 仍然由服务端根据 initData 验签后返回资产；这里只是避免 UI 出现“同步中”提示
    set({ error: null, initData });
    try {
      const response = await Promise.race([
        syncUserAssets(initData),
        new Promise<{ success: false; error: string }>((resolve) =>
          setTimeout(() => resolve({ success: false, error: '同步超时，请重试' }), 12_000)
        ),
      ]);
      if (response.success && response.data) {
        get().setAssetsFromServer({
          balance: Number(response.data.balance),
          stars: Number(response.data.stars),
        });
        return;
      }
      // 静默失败：只记录 error，不阻塞 UI
      set({ error: response.error || '同步失败' });
    } catch (err: unknown) {
      console.error('Store syncSilent error:', err);
      const message =
        typeof err === 'object' && err !== null && 'message' in err
          ? String((err as { message?: unknown }).message || '同步失败')
          : '同步失败';
      set({ error: message });
    }
  },

  updateAssets: async (initData, params) => {
    // 1. 备份旧状态以便失败回滚
    const previousBalance = get().balance;
    const previousStars = get().stars;

    // 2. 乐观更新 UI
    set((state) => ({
      [params.type]: Number(state[params.type]) + params.amount,
    }));

    try {
      // 3. 执行服务器 Action
      const response = await processAssetChange(initData, params);
      
      if (!response.success) {
        throw new Error(response.error || "资产更新失败");
      }

      // 更新为最终服务器确认的余额
      set({ [params.type]: Number(response.newBalance) });
    } catch (err: unknown) {
      // 4. 回滚状态
      const message =
        typeof err === 'object' && err !== null && 'message' in err
          ? String((err as { message?: unknown }).message || '资产更新失败')
          : '资产更新失败';
      set({ 
        balance: previousBalance, 
        stars: previousStars,
        error: message 
      });
      console.error("Store update error (rolled back):", err);
      // 可选：抛出错误让组件显示 Toast
      throw err;
    }
  },
}));
