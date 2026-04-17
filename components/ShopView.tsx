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
  // Telegram WebView / 老版本 iOS 可能没有 crypto.randomUUID
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  // 生成 RFC4122 v4 UUID（满足服务端 zod.uuid() 校验）
  const bytes = new Uint8Array(16);
  c?.getRandomValues?.(bytes);
  // 若 getRandomValues 也不可用，再降级为 Math.random（仍保持 UUID 形状）
  if (!c?.getRandomValues) {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  // version 4
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  // variant 10
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
    // 忽略：非 Telegram 环境或不支持触感
  }
}

function hapticNotify(type: 'success' | 'error' | 'warning') {
  try {
    sdkHapticNotify(type);
  } catch {
    // 忽略：非 Telegram 环境或不支持触感
  }
}

export default function ShopView() {
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
    // 登录成功后只加载一次；切换 Tab 重新 mount 也不会重复请求
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
          // SECURITY: 只提交“动作”(购买某商品、数量、幂等 requestId) + initData；扣款/发货由服务端+DB 原子保证
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

        // 购买成功后优先用接口回传的“可信资产快照”更新顶部资产（避免二次同步在弱网下延迟/失败）
        // SECURITY: assets 由服务端在校验 initData + DB 原子事务后返回，前端不参与计算
        const assets = json?.data?.assets;
        if (assets && (typeof assets.balance !== 'undefined' || typeof assets.stars !== 'undefined')) {
          setAssetsFromServer({
            balance: Number(assets.balance ?? 0),
            stars: Number(assets.stars ?? 0),
          });
        }

        // 购买成功后静默刷新资产，避免顶部资产显示滞后
        void syncSilent(initData);
        // 购买成功后静默刷新商品列表（避免有库存/上下架变化时 UI 不更新）
        void refreshSilent(initData);
        // 购买成功后静默刷新宝箱/藏品：商品可能发放宝箱或物品
        // SECURITY: 仍只传 initData，服务端验签后返回可信数据
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
          onClick={() => {
            hapticImpact('soft');
            if (initData) refresh(initData);
          }}
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
                  {/* 纯装饰层：必须不拦截点击 */}
                  <div className="pointer-events-none absolute -top-12 -right-12 w-36 h-36 rounded-full blur-3xl opacity-20 bg-purple-500" />

                  <div className="relative z-10 flex items-start justify-between gap-3">
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
                      type="button"
                      disabled={isPurchasing}
                      onClick={() => void purchase(p.id)}
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

