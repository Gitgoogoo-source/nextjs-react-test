import { create } from 'zustand';

// 与 /api/chest/list 返回结构保持一致
export interface ChestListItem {
  case_id: string;
  case_key: string;
  quantity: number;
  price: number;
  name: string;
  color: string;
  shadow: string;
  description: string;
}

interface ChestState {
  chests: ChestListItem[];
  isLoading: boolean;
  error: string | null;
  hasLoaded: boolean;
  loadedAt: number | null;

  // 只在“用户登录成功”后触发一次；后续组件 mount 不会重复请求
  loadOnce: (initData: string) => Promise<void>;
  // 用于手动刷新/开启宝箱后刷新，强制走后端获取最新数量与价格
  refresh: (initData: string) => Promise<void>;
  // 静默刷新：不触发 isLoading（用于开箱动画期间后台刷新，避免主界面出现“加载宝箱中...”）
  refreshSilent: (initData: string) => Promise<void>;
  reset: () => void;
}

async function fetchChestList(initData: string): Promise<ChestListItem[]> {
  const res = await fetch('/api/chest/list', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // 只传 initData，服务端验签后取 userId，拒绝伪造
    body: JSON.stringify({ initData }),
  });

  const body = (await res.json()) as {
    success?: boolean;
    data?: { chests?: ChestListItem[] };
    error?: string;
  };

  if (!res.ok || !body.success) {
    throw new Error(body.error || '加载宝箱失败');
  }

  return Array.isArray(body.data?.chests) ? body.data!.chests : [];
}

export const useChestStore = create<ChestState>((set, get) => ({
  chests: [],
  isLoading: false,
  error: null,
  hasLoaded: false,
  loadedAt: null,

  loadOnce: async (initData) => {
    if (!initData) return;
    // 已加载过则直接返回，避免切 tab 反复请求
    if (get().hasLoaded) return;
    await get().refresh(initData);
  },

  refresh: async (initData) => {
    if (!initData) return;
    set({ isLoading: true, error: null });
    try {
      const chests = await fetchChestList(initData);
      set({
        chests,
        hasLoaded: true,
        loadedAt: Date.now(),
      });
    } catch (e: unknown) {
      const message =
        typeof e === 'object' && e !== null && 'message' in e
          ? String((e as { message?: unknown }).message || '加载宝箱失败')
          : '加载宝箱失败';
      set({ error: message });
    } finally {
      set({ isLoading: false });
    }
  },

  refreshSilent: async (initData) => {
    if (!initData) return;
    // 仍只传 initData，服务端验签后取 userId；这里只是避免 loading UI
    try {
      const chests = await fetchChestList(initData);
      set({
        chests,
        hasLoaded: true,
        loadedAt: Date.now(),
      });
    } catch (e: unknown) {
      // 静默失败：只记录 error，不中断 UI
      const message =
        typeof e === 'object' && e !== null && 'message' in e
          ? String((e as { message?: unknown }).message || '加载宝箱失败')
          : '加载宝箱失败';
      set({ error: message });
    }
  },

  reset: () =>
    set({
      chests: [],
      isLoading: false,
      error: null,
      hasLoaded: false,
      loadedAt: null,
    }),
}));

