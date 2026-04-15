import { create } from 'zustand';

// 与 /api/collection/list 返回结构保持一致
export interface CollectionListItem {
  item_id: string; // uuid
  quantity: number;
  name: string;
  rarity: string;
  color: string;
  border: string;
  hex: string;
}

interface CollectionState {
  items: CollectionListItem[];
  isLoading: boolean;
  error: string | null;
  hasLoaded: boolean;
  loadedAt: number | null;

  // 只在“用户登录成功”后触发一次；后续切换 Tab 不会重复请求
  loadOnce: (initData: string) => Promise<void>;
  // 用于手动刷新/开箱后刷新，强制走后端获取最新藏品
  refresh: (initData: string) => Promise<void>;
  // 静默刷新：不触发 isLoading（用于开箱动画期间后台刷新）
  refreshSilent: (initData: string) => Promise<void>;
  reset: () => void;
}

async function fetchCollectionList(initData: string): Promise<CollectionListItem[]> {
  const res = await fetch('/api/collection/list', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // SECURITY: 只传 initData，服务端验签后取 userId，拒绝伪造
    body: JSON.stringify({ initData }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to fetch collection');
  }

  const data = (await res.json()) as { items?: CollectionListItem[] };
  return Array.isArray(data.items) ? data.items : [];
}

export const useCollectionStore = create<CollectionState>((set, get) => ({
  items: [],
  isLoading: false,
  error: null,
  hasLoaded: false,
  loadedAt: null,

  loadOnce: async (initData) => {
    if (!initData) return;
    if (get().hasLoaded) return;
    await get().refresh(initData);
  },

  refresh: async (initData) => {
    if (!initData) return;
    set({ isLoading: true, error: null });
    try {
      const items = await fetchCollectionList(initData);
      set({ items, hasLoaded: true, loadedAt: Date.now() });
    } catch (e: unknown) {
      const message =
        typeof e === 'object' && e !== null && 'message' in e
          ? String((e as { message?: unknown }).message || '加载藏品失败')
          : '加载藏品失败';
      set({ error: message });
    } finally {
      set({ isLoading: false });
    }
  },

  refreshSilent: async (initData) => {
    if (!initData) return;
    // SECURITY: 仍只传 initData，服务端验签后取 userId；这里只是避免 loading UI
    try {
      const items = await fetchCollectionList(initData);
      set({ items, hasLoaded: true, loadedAt: Date.now() });
    } catch (e: unknown) {
      const message =
        typeof e === 'object' && e !== null && 'message' in e
          ? String((e as { message?: unknown }).message || '加载藏品失败')
          : '加载藏品失败';
      set({ error: message });
    }
  },

  reset: () =>
    set({
      items: [],
      isLoading: false,
      error: null,
      hasLoaded: false,
      loadedAt: null,
    }),
}));

