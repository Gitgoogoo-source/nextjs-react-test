'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ShoppingBag, Sparkles, RefreshCcw, AlertTriangle, Loader2 } from 'lucide-react';
import { useTelegramAuth } from '@/hooks/useTelegramAuth';
import {
  telegramHapticImpact as sdkHapticImpact,
  telegramHapticNotify as sdkHapticNotify,
} from '@/lib/telegram-haptics';
import { useUserStore } from '@/store/useUserStore';
import { useShopStore } from '@/store/useShopStore';
import { useChestStore } from '@/store/useChestStore';
import { useCollectionStore } from '@/store/useCollectionStore';

function safeUUID() {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  const bytes = new Uint8Array(16);
  c?.getRandomValues?.(bytes);
  if (!c?.getRandomValues) {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function currencyLabel(currency: string) {
  if (currency === 'balance') return '叶子';
  if (currency === 'stars') return '星星';
  return currency;
}

function hapticImpact(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') {
  try {
    sdkHapticImpact(style);
  } catch {
    // 忽略
  }
}

function hapticNotify(type: 'success' | 'error' | 'warning') {
  try {
    sdkHapticNotify(type);
  } catch {
    // 忽略
  }
}

/** 嵌入「宝箱」页下半部分的商城：4 列网格；纵向滚动由外层页面统一处理 */
export function ShopSection() {
  const { isSyncing } = useTelegramAuth();
  const initData = useUserStore((s) => s.initData);
  const syncSilent = useUserStore((s) => s.syncSilent);
  const setAssetsFromServer = useUserStore((s) => s.setAssetsFromServer);

  const { products, isLoading, error, hasLoaded, loadOnce, refresh, refreshSilent } = useShopStore();
  const [purchasingId, setPurchasingId] = useState<string | null>(null);
  const [purchaseRequestIds, setPurchaseRequestIds] = useState<Record<string, string>>({});
  const [actionError, setActionError] = useState<string | null>(null);

  const visibleProducts = useMemo(() => {
    return (products ?? []).filter((p) => p && p.id);
  }, [products]);

  useEffect(() => {
    if (isSyncing) return;
    if (!initData) return;
    if (hasLoaded) return;
    void loadOnce(initData);
  }, [isSyncing, initData, hasLoaded, loadOnce]);

  const purchase = useCallback(
    async (productId: string) => {
      if (!initData) {
        setActionError('未获取到登录信息，请在 Telegram 内重新打开小游戏');
        hapticNotify('error');
        return;
      }
      hapticImpact('light');
      setPurchasingId(productId);
      setActionError(null);
      try {
        const requestId = purchaseRequestIds[productId] ?? safeUUID();
        setPurchaseRequestIds((prev) => (prev[productId] ? prev : { ...prev, [productId]: requestId }));
        const res = await fetch('/api/shop/purchase', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ productId, quantity: 1, requestId, initData }),
        });

        const raw = await res.text();
        const json = (() => {
          try {
            return raw
              ? (JSON.parse(raw) as {
                  success?: boolean;
                  error?: string;
                  data?: { assets?: { balance?: number; stars?: number } };
                })
              : {};
          } catch {
            return {};
          }
        })();

        if (!res.ok || !json?.success) {
          throw new Error(json?.error || (raw ? raw.slice(0, 160) : '购买失败'));
        }

        hapticNotify('success');

        const assets = json?.data?.assets;
        if (assets && (typeof assets.balance !== 'undefined' || typeof assets.stars !== 'undefined')) {
          setAssetsFromServer({
            balance: Number(assets.balance ?? 0),
            stars: Number(assets.stars ?? 0),
          });
        }

        void syncSilent(initData);
        void refreshSilent(initData);
        void useChestStore.getState().refreshSilent(initData);
        void useCollectionStore.getState().refreshSilent(initData);
      } catch (e: unknown) {
        const message =
          typeof e === 'object' && e !== null && 'message' in e ? String((e as { message?: unknown }).message) : '购买失败';
        setActionError(message);
        hapticNotify('error');
      } finally {
        setPurchasingId(null);
        setPurchaseRequestIds((prev) => {
          if (!prev[productId]) return prev;
          const next = { ...prev };
          delete next[productId];
          return next;
        });
      }
    },
    [initData, purchaseRequestIds, refreshSilent, setAssetsFromServer, syncSilent]
  );

  if (isLoading || isSyncing) {
    return (
      <div className="flex w-full flex-col px-3 pb-2">
        <div className="shrink-0 flex items-center gap-2 mb-2 px-0.5">
          <ShoppingBag className="w-5 h-5 text-white/90" />
          <h3 className="text-app-heading font-bold text-white">商城</h3>
        </div>
        <div className="flex min-h-[100px] items-center justify-center py-6">
          <div className="flex items-center gap-2 text-white/90">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-app-body animate-pulse">加载商品中...</span>
          </div>
        </div>
      </div>
    );
  }

  if (!initData) {
    return (
      <div className="flex w-full flex-col justify-center px-3 py-4 pb-2">
        <div className="shrink-0 flex items-center gap-2 mb-2 px-0.5">
          <ShoppingBag className="w-5 h-5 text-white/90" />
          <h3 className="text-app-heading font-bold text-white">商城</h3>
        </div>
        <div className="flex flex-col items-center justify-center text-center px-2 py-4">
          <AlertTriangle className="w-10 h-10 text-zinc-700 mb-2" />
          <div className="mb-1 text-app-title font-semibold text-white">未获取到登录信息</div>
          <div className="text-app-caption text-zinc-500">请在 Telegram 内打开小游戏后再购买。</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex w-full flex-col px-3 pb-2">
        <div className="shrink-0 flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-white/90" />
            <h3 className="text-app-heading font-bold text-white">商城</h3>
          </div>
        </div>
        <div className="flex min-h-[120px] flex-col items-center justify-center px-2 py-6 text-center">
          <AlertTriangle className="w-10 h-10 text-zinc-700 mb-2" />
          <div className="mb-1 text-app-title font-semibold text-white">加载失败</div>
          <div className="mb-3 text-app-caption text-zinc-500">{error}</div>
          <button
            onClick={() => initData && refresh(initData)}
            className="rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-app-title font-bold text-white transition-colors hover:bg-white/15 active:scale-95"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col px-3 pb-safe pt-1">
      <div className="shrink-0 flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <ShoppingBag className="w-5 h-5 text-white/90" />
          <h3 className="text-app-heading font-bold text-white">商城</h3>
        </div>
        <button
          onClick={() => {
            hapticImpact('soft');
            if (initData) refresh(initData);
          }}
          className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center transition-colors active:scale-95"
          aria-label="刷新商品"
          type="button"
        >
          <RefreshCcw className="w-3.5 h-3.5 text-gray-300" />
        </button>
      </div>

      {actionError ? (
        <div className="mb-2 shrink-0 rounded-lg border border-red-500/30 bg-red-500/10 px-2 py-1.5 text-app-caption text-red-200">
          {actionError}
        </div>
      ) : null}

      {visibleProducts.length === 0 ? (
        <div className="flex min-h-[100px] flex-col items-center justify-center px-2 py-8 text-center">
          <Sparkles className="w-12 h-12 text-zinc-700 mb-2" />
          <div className="mb-0.5 text-app-title font-semibold text-white">暂无上架商品</div>
          <div className="text-app-caption text-zinc-500">稍后再来看看吧。</div>
        </div>
      ) : (
        <div className="pb-2">
          <div className="grid grid-cols-4 gap-2">
            {visibleProducts.map((p) => {
              const isPurchasing = purchasingId === p.id;
              const title = p.title || p.cases?.name || p.items?.name || '未命名';
              const desc = p.description || p.cases?.description || null;
              const currency = String(p.currency || '');
              const price = Number(p.price) || 0;

              return (
                <motion.div
                  key={p.id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.18 }}
                  className="relative rounded-xl border border-white/10 bg-white/5 backdrop-blur-md p-2 overflow-hidden flex flex-col min-h-[118px]"
                >
                  <div className="pointer-events-none absolute -top-8 -right-8 w-20 h-20 rounded-full blur-2xl opacity-25 bg-purple-500" />

                  <div className="relative z-10 flex flex-col flex-1 min-h-0">
                    <div className="line-clamp-3 min-h-[2.6rem] text-app-caption font-bold leading-snug text-white">{title}</div>
                    {desc ? (
                      <div className="mt-0.5 line-clamp-2 flex-1 text-app-caption text-gray-400/90">{desc}</div>
                    ) : null}

                    <div className="mt-auto space-y-1 pt-1.5">
                      <div className="text-app-caption font-semibold leading-tight text-white/90 tabular-nums">
                        {price.toLocaleString()}
                        <span className="ml-0.5 font-normal text-gray-400">{currencyLabel(currency)}</span>
                      </div>
                      <button
                        type="button"
                        disabled={isPurchasing}
                        onClick={() => void purchase(p.id)}
                        className={[
                          'w-full rounded-lg border py-1 text-app-caption font-bold text-white transition-colors active:scale-[0.98]',
                          isPurchasing
                            ? 'bg-white/10 border-white/10 opacity-80 cursor-not-allowed'
                            : 'bg-purple-600/85 hover:bg-purple-600 border-purple-400/25',
                        ].join(' ')}
                      >
                        {isPurchasing ? '…' : '购买'}
                      </button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
