'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ShoppingBag, Sparkles, RefreshCcw, AlertTriangle, Loader2 } from 'lucide-react';
import { useTelegramAuth } from '@/hooks/useTelegramAuth';
import { useUserStore } from '@/store/useUserStore';
import { useShopStore } from '@/store/useShopStore';

function currencyLabel(currency: string) {
  if (currency === 'balance') return '叶子';
  if (currency === 'stars') return '星星';
  return currency;
}

export default function ShopView() {
  const { isSyncing } = useTelegramAuth();
  const initData = useUserStore((s) => s.initData);
  const syncSilent = useUserStore((s) => s.syncSilent);

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
    // 登录成功后只加载一次；切换 Tab 重新 mount 也不会重复请求
    void loadOnce(initData);
  }, [isSyncing, initData, hasLoaded, loadOnce]);

  const purchase = useCallback(
    async (productId: string) => {
      if (!initData) return;
      setPurchasingId(productId);
      setActionError(null);
      try {
        const requestId = purchaseRequestIds[productId] ?? crypto.randomUUID();
        setPurchaseRequestIds((prev) => (prev[productId] ? prev : { ...prev, [productId]: requestId }));
        const res = await fetch('/api/shop/purchase', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          // SECURITY: 只提交“动作”(购买某商品、数量、幂等 requestId) + initData；扣款/发货由服务端+DB 原子保证
          body: JSON.stringify({ productId, quantity: 1, requestId, initData }),
        });
        const json = (await res.json()) as { success?: boolean; error?: string };
        if (!res.ok || !json?.success) {
          throw new Error(json?.error || '购买失败');
        }

        // 购买成功后静默刷新资产，避免顶部资产显示滞后
        void syncSilent(initData);
        // 购买成功后静默刷新商品列表（避免有库存/上下架变化时 UI 不更新）
        void refreshSilent(initData);
      } catch (e: unknown) {
        const message =
          typeof e === 'object' && e !== null && 'message' in e ? String((e as { message?: unknown }).message) : '购买失败';
        setActionError(message);
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
    [initData, purchaseRequestIds, syncSilent, refreshSilent]
  );

  if (isLoading || isSyncing) {
    return (
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="flex items-center gap-2 text-white/90">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-lg animate-pulse">加载商城中...</span>
        </div>
      </div>
    );
  }

  if (!initData) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center px-4 text-center">
        <AlertTriangle className="w-16 h-16 text-zinc-700 mb-3" />
        <div className="text-white font-bold text-xl mb-1">未获取到登录信息</div>
        <div className="text-zinc-400">请在 Telegram 内打开小游戏后再进入商城。</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center px-4 text-center">
        <AlertTriangle className="w-16 h-16 text-zinc-700 mb-3" />
        <div className="text-white font-bold text-xl mb-1">加载失败</div>
        <div className="text-zinc-400 mb-5">{error}</div>
        <button
          onClick={() => initData && refresh(initData)}
          className="px-6 py-3 rounded-xl font-bold text-white bg-white/10 hover:bg-white/15 border border-white/10 transition-colors active:scale-95"
        >
          重试
        </button>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 flex flex-col px-4 py-6 overflow-hidden">
      <div className="shrink-0 flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <ShoppingBag className="w-6 h-6 text-white/90" />
          <h2 className="text-2xl font-bold text-white">商城</h2>
        </div>
        <button
          onClick={() => initData && refresh(initData)}
          className="w-9 h-9 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center transition-colors active:scale-95"
          aria-label="刷新商品"
        >
          <RefreshCcw className="w-4 h-4 text-gray-300" />
        </button>
      </div>

      {actionError ? (
        <div className="shrink-0 mb-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {actionError}
        </div>
      ) : null}

      {visibleProducts.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-4">
          <Sparkles className="w-16 h-16 text-zinc-700 mb-3" />
          <div className="text-white font-bold text-xl mb-1">暂无上架商品</div>
          <div className="text-zinc-400">稍后再来看看吧。</div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto pb-24 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          <div className="grid grid-cols-1 gap-3">
            {visibleProducts.map((p) => {
              const isPurchasing = purchasingId === p.id;
              const title = p.title || p.cases?.name || p.items?.name || '未命名商品';
              const desc = p.description || p.cases?.description || null;
              const currency = String(p.currency || '');
              const price = Number(p.price) || 0;

              return (
                <motion.div
                  key={p.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                  className="relative rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md p-4 overflow-hidden"
                >
                  <div className="absolute -top-12 -right-12 w-36 h-36 rounded-full blur-3xl opacity-20 bg-purple-500" />

                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-white font-bold text-lg leading-snug line-clamp-1">{title}</div>
                      {desc ? (
                        <div className="mt-1 text-sm text-gray-300/90 line-clamp-2">{desc}</div>
                      ) : (
                        <div className="mt-1 text-sm text-gray-500">暂无描述</div>
                      )}

                      <div className="mt-3 inline-flex items-center gap-2 text-xs font-bold px-2.5 py-1.5 rounded-full bg-black/30 border border-white/10">
                        <span className="text-gray-300">价格</span>
                        <span className="text-white tabular-nums">{price.toLocaleString()}</span>
                        <span className="text-gray-300">{currencyLabel(currency)}</span>
                      </div>
                    </div>

                    <button
                      disabled={isPurchasing}
                      onClick={() => purchase(p.id)}
                      className={[
                        'shrink-0 px-4 py-2 rounded-xl font-bold text-white border transition-colors active:scale-95',
                        isPurchasing
                          ? 'bg-white/10 border-white/10 opacity-80 cursor-not-allowed'
                          : 'bg-purple-600/80 hover:bg-purple-600 border-purple-400/30',
                      ].join(' ')}
                    >
                      {isPurchasing ? '购买中…' : '购买'}
                    </button>
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

