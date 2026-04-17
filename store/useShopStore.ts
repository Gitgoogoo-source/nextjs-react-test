import { create } from 'zustand';

export type ShopCurrency = 'balance' | 'stars';
export type ProductType = 'case' | 'item' | 'bundle' | 'unknown';

export interface ShopProduct {
  id: string;
  product_type: ProductType | string;
  title: string;
  description: string | null;
  currency: ShopCurrency | string;
  price: number;
  is_active?: boolean;
  case_id: string | null;
  item_id: string | null;
  cases?: { id: string; name: string; case_key: string; price: number; description: string | null } | null;
  items?: { id: string; name: string; rarity: string; color: string | null; border: string | null; hex: string | null } | null;
}

interface ShopState {
  products: ShopProduct[];
  isLoading: boolean;
  error: string | null;
  hasLoaded: boolean;
  loadedAt: number | null;

  // 只在“用户登录成功”后触发一次；后续切换 Tab 不会重复请求
  loadOnce: (initData: string) => Promise<void>;
  // 手动刷新：强制从后端获取最新商品列表
  refresh: (initData: string) => Promise<void>;
  // 静默刷新：不触发 isLoading（用于购买成功后后台更新列表）
  refreshSilent: (initData: string) => Promise<void>;
  reset: () => void;
}

async function fetchShopProducts(initData: string): Promise<ShopProduct[]> {
  const res = await fetch('/api/shop/products/list', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // 前端只传 initData；服务端会验签并从中提取可信 userId
    body: JSON.stringify({ initData }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to fetch shop products');
  }

  const body = (await res.json()) as {
    success?: boolean;
    data?: { products?: ShopProduct[] };
    error?: string;
  };
  if (!body?.success || !body.data) {
    throw new Error(body?.error || '加载商城失败');
  }
  return Array.isArray(body.data.products) ? body.data.products : [];
}

export const useShopStore = create<ShopState>((set, get) => ({
  products: [],
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
      const products = await fetchShopProducts(initData);
      set({ products, hasLoaded: true, loadedAt: Date.now() });
    } catch (e: unknown) {
      const message =
        typeof e === 'object' && e !== null && 'message' in e
          ? String((e as { message?: unknown }).message || '加载商城失败')
          : '加载商城失败';
      set({ error: message });
    } finally {
      set({ isLoading: false });
    }
  },

  refreshSilent: async (initData) => {
    if (!initData) return;
    // 仍只传 initData；这里只是避免 loading UI
    try {
      const products = await fetchShopProducts(initData);
      set({ products, hasLoaded: true, loadedAt: Date.now() });
    } catch (e: unknown) {
      const message =
        typeof e === 'object' && e !== null && 'message' in e
          ? String((e as { message?: unknown }).message || '加载商城失败')
          : '加载商城失败';
      set({ error: message });
    }
  },

  reset: () =>
    set({
      products: [],
      isLoading: false,
      error: null,
      hasLoaded: false,
      loadedAt: null,
    }),
}));

