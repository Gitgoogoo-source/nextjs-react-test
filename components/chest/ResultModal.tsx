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
          initial={{ opacity: 0, y: 50, scale: 0.5 }}
          animate={{ opacity: 1, y: 0, scale: 1.2 }}
          transition={{ type: 'spring', bounce: 0.5, duration: 0.8 }}
          className="absolute bottom-1/4 flex flex-col items-center z-30"
        >
          <div className={`absolute inset-0 blur-3xl opacity-40 ${wonItem.color.replace('/20', '')} rounded-full scale-150 -z-10`} />

          <div className="text-zinc-300 mb-2 font-medium tracking-widest text-sm uppercase">获得物品</div>

          <div className={`relative w-32 h-32 rounded-2xl border-4 ${wonItem.border.replace('/50', '')} ${wonItem.color} backdrop-blur-md flex flex-col items-center justify-center shadow-2xl mb-6 overflow-hidden`}>
            {['Classified', 'Covert', 'Rare Special'].includes(wonItem.rarity) && (
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.6)_0%,transparent_70%)] animate-spin-slow" />
            )}
            <div className="absolute inset-0 bg-gradient-to-br from-white/30 to-transparent opacity-50" />
            <Package className="w-16 h-16 text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.8)] relative z-10" />
          </div>

          <div className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-b from-white to-zinc-400 drop-shadow-[0_0_10px_rgba(255,255,255,0.3)] mb-8">
            {wonItem.name}
          </div>

          <button
            onClick={onClose}
            className="px-10 py-4 rounded-xl font-bold text-white bg-zinc-800/80 backdrop-blur-md hover:bg-zinc-700/80 border border-zinc-600 transition-colors shadow-lg active:scale-95"
          >
            收下物品
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
