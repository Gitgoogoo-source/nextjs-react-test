'use client';

import React, { useEffect } from 'react';
import { Archive, Package } from 'lucide-react';
import { useTelegramAuth } from '@/hooks/useTelegramAuth';
import { useUserStore } from '@/store/useUserStore';
import { useCollectionStore } from '@/store/useCollectionStore';

const RARITY_LABEL: Record<string, string> = {
  'Mil-Spec': '军规级',
  Restricted: '受限级',
  Classified: '保密级',
  Covert: '隐秘级',
  'Rare Special': '罕见级',
};


export default function CollectionView() {
  const { isSyncing } = useTelegramAuth();
  const initData = useUserStore((s) => s.initData);
  const { items, isLoading, error, hasLoaded, loadOnce } = useCollectionStore();

  // 登录后只加载一次；切换 Tab 重新 mount 也不会重复请求
  useEffect(() => {
    if (isSyncing) return;
    if (!initData) return;
    if (hasLoaded) return;
    loadOnce(initData).catch((e) => console.error(e));
  }, [isSyncing, initData, hasLoaded, loadOnce]);

  if (isLoading || isSyncing) {
    return (
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-app-heading animate-pulse font-semibold text-white">加载藏品中...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center px-4">
        <Archive className="w-20 h-20 text-zinc-700 mb-4" />
        <h2 className="mb-2 text-app-heading font-bold text-white">加载失败</h2>
        <p className="mb-6 text-center text-app-body text-zinc-400">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="px-6 py-3 rounded-xl font-bold text-white bg-zinc-800/80 backdrop-blur-md hover:bg-zinc-700/80 border border-zinc-600 transition-colors shadow-lg active:scale-95"
        >
          刷新重试
        </button>
      </div>
    );
  }

  if (!items || items.length === 0) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center px-4">
        <Archive className="w-24 h-24 text-zinc-700 mb-4" />
        <h2 className="mb-2 text-app-heading font-bold text-white">暂无藏品</h2>
        <p className="text-center text-app-body text-zinc-400">去开宝箱获取第一件藏品吧！</p>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 flex flex-col px-4 py-6 overflow-hidden">
      <div className="shrink-0 mb-4">
        <h2 className="mb-1 text-app-heading font-bold text-white">我的藏品</h2>
      </div>

      <div className="flex-1 overflow-y-auto pb-24 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        <div className="grid grid-cols-2 gap-3">
          {items
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((it) => (
              <div
                key={it.item_id}
                className={[
                  'relative rounded-2xl border bg-white/5 backdrop-blur-md p-4 overflow-hidden',
                  it.border || 'border-white/10',
                ].join(' ')}
              >
                {/* 背景光效 */}
                <div
                  className="absolute -top-10 -right-10 w-32 h-32 rounded-full blur-3xl opacity-30"
                  style={{ backgroundColor: it.hex || '#ffffff' }}
                />

                <div
                  className={[
                    'w-12 h-12 rounded-xl flex items-center justify-center mb-3 shadow-inner border',
                    it.color || 'bg-white/10',
                    it.border || 'border-white/10',
                  ].join(' ')}
                >
                  <Package className="w-6 h-6 text-white/90" />
                </div>

                <div className="line-clamp-2 font-bold leading-snug text-app-title text-white">{it.name}</div>

                <div className="mt-2 flex items-center justify-between">
                  <div className="text-app-caption text-gray-300">
                    {RARITY_LABEL[it.rarity] ? `${RARITY_LABEL[it.rarity]} · ${it.rarity}` : it.rarity}
                  </div>
                  <div className="rounded-full border border-white/10 bg-black/30 px-2 py-1 text-app-caption font-bold text-white tabular-nums">
                    x{it.quantity}
                  </div>
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

