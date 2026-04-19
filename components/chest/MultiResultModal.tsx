'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Package } from 'lucide-react';
import type { PrizeViewItem } from '@/hooks/useOpenChest';
import { findHighestRarityItem } from '@/hooks/useOpenChest';

const RARE_RARITIES = new Set(['Classified', 'Covert', 'Rare Special']);

interface MultiResultModalProps {
  showResult: boolean;
  wonItems: PrizeViewItem[];
  onClose: () => void;
}

export function MultiResultModal({ showResult, wonItems, onClose }: MultiResultModalProps) {
  // 按稀有度从高到低排序展示
  const sorted = [...wonItems].sort((a, b) => {
    const w: Record<string, number> = { 'Rare Special': 5, Covert: 4, Classified: 3, Restricted: 2, 'Mil-Spec': 1 };
    return (w[b.rarity] ?? 0) - (w[a.rarity] ?? 0);
  });

  const highlight = findHighestRarityItem(wonItems);
  const hasRare = highlight ? RARE_RARITIES.has(highlight.rarity) : false;

  return (
    <AnimatePresence>
      {showResult && wonItems.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          transition={{ type: 'spring', bounce: 0.28, duration: 0.55 }}
          className="absolute inset-0 z-30 flex flex-col items-center justify-center px-3"
        >
          {/* 高稀有物品光晕背景 */}
          {hasRare && highlight && (
            <div
              className={`absolute inset-0 blur-3xl opacity-20 ${highlight.color.replace('/20', '')} pointer-events-none`}
            />
          )}

          <div className="mb-3 text-app-caption font-medium uppercase tracking-widest text-zinc-300">十连开结果</div>

          {/* 2×5 网格 */}
          <div className="grid grid-cols-5 gap-2 w-full max-w-xs">
            {sorted.map((item, idx) => {
              const isRare = RARE_RARITIES.has(item.rarity);
              return (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.06, type: 'spring', bounce: 0.35, duration: 0.48 }}
                  className={`relative flex aspect-square transform-gpu flex-col items-center justify-center overflow-hidden rounded-lg border-2 p-1.5 will-change-transform ${item.border} ${item.color}`}
                >
                  {isRare && (
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.35)_0%,transparent_70%)] animate-pulse" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent opacity-40" />
                  <Package className="w-6 h-6 text-white/90 drop-shadow-md relative z-10" />
                  <span className="relative z-10 mt-0.5 line-clamp-2 text-center text-app-caption font-bold leading-tight text-white">
                    {item.name}
                  </span>
                  {isRare && (
                    <div className={`absolute inset-0 rounded-lg border-2 ${item.border.replace('/50', '')} pointer-events-none mix-blend-overlay`} />
                  )}
                </motion.div>
              );
            })}
          </div>

          {/* 最高稀有物品高亮展示 */}
          {highlight && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7, duration: 0.4 }}
              className="mt-4 flex flex-col items-center"
            >
              <span className="mb-1 text-app-caption text-zinc-400">最高稀有</span>
              <span className="bg-gradient-to-b from-white to-zinc-400 bg-clip-text text-center text-app-title font-black text-transparent">
                {highlight.name}
              </span>
              <span className="mt-0.5 text-app-caption" style={{ color: highlight.hex }}>
                {highlight.rarity}
              </span>
            </motion.div>
          )}

          <motion.button
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.9, duration: 0.3 }}
            onClick={onClose}
            className="mt-5 rounded-xl border border-zinc-600 bg-zinc-800/80 px-10 py-3 text-app-title font-bold text-white shadow-lg backdrop-blur-md transition-colors hover:bg-zinc-700/80 active:scale-95"
          >
            收下全部
          </motion.button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
