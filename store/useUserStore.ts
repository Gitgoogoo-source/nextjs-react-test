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
        set({
          balance: Number(response.data.balance),
          stars: Number(response.data.stars),
        });
        return;
      }
      set({ error: response.error || "同步失败" });
    } catch (err: any) {
      console.error("Store sync error:", err);
      set({ error: err.message || "同步失败" });
    } finally {
      set({ isSyncing: false });
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
    } catch (err: any) {
      // 4. 回滚状态
      set({ 
        balance: previousBalance, 
        stars: previousStars,
        error: err.message 
      });
      console.error("Store update error (rolled back):", err);
      // 可选：抛出错误让组件显示 Toast
      throw err;
    }
  },
}));
