'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Package } from 'lucide-react';
import type { PrizeViewItem } from '@/hooks/useOpenChest';

interface ResultModalProps {
  showResult: boolean;
  wonItem: PrizeViewItem | null;
  onClose: () => void;
}

export function ResultModal({ showResult, wonItem, onClose }: ResultModalProps) {
  return (
    <AnimatePresence>
      {showResult && wonItem && (
        <motion.div
          initial={{ opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', bounce: 0.45, duration: 0.65 }}
          className="absolute bottom-1/4 z-30 flex flex-col items-center"
        >
          <div className={`absolute inset-0 -z-10 scale-150 rounded-full opacity-40 blur-3xl ${wonItem.color.replace('/20', '')}`} />

          <div className="mb-2 text-app-caption font-medium uppercase tracking-widest text-zinc-300">获得物品</div>

          <div className={`relative w-32 h-32 rounded-2xl border-4 ${wonItem.border.replace('/50', '')} ${wonItem.color} backdrop-blur-md flex flex-col items-center justify-center shadow-2xl mb-6 overflow-hidden`}>
            {['Classified', 'Covert', 'Rare Special'].includes(wonItem.rarity) && (
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.6)_0%,transparent_70%)] animate-spin-slow" />
            )}
            <div className="absolute inset-0 bg-gradient-to-br from-white/30 to-transparent opacity-50" />
            <Package className="w-16 h-16 text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.8)] relative z-10" />
          </div>

          <div className="mb-8 bg-gradient-to-b from-white to-zinc-400 bg-clip-text text-center text-app-title font-black text-transparent drop-shadow-[0_0_10px_rgba(255,255,255,0.3)]">
            {wonItem.name}
          </div>

          <button
            onClick={onClose}
            className="rounded-xl border border-zinc-600 bg-zinc-800/80 px-10 py-4 text-app-title font-bold text-white shadow-lg backdrop-blur-md transition-colors hover:bg-zinc-700/80 active:scale-95"
          >
            收下物品
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
