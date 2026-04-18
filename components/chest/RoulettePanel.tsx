'use client';

import { useEffect, useState } from 'react';
import { motion, useTransform, useMotionTemplate, type MotionValue } from 'framer-motion';
import { Package } from 'lucide-react';
import { ArrowLeft } from 'lucide-react';
import { ResultModal } from './ResultModal';
import type { PrizeViewItem } from '@/hooks/useOpenChest';

interface RouletteItemProps {
  item: PrizeViewItem;
  idx: number;
  x: MotionValue<number>;
  itemWidth: number;
}

function RouletteItem({ item, idx, x, itemWidth }: RouletteItemProps) {
  const center = idx * itemWidth + itemWidth / 2;
  const range = [-center - itemWidth, -center, -center + itemWidth];
  const scale = useTransform(x, range, [1, 1.15, 1]);
  const brightness = useTransform(x, range, [0.5, 1.2, 0.5]);
  const zIndex = useTransform(x, range, [0, 10, 0]);
  const glowOpacity = useTransform(x, range, [0, 1, 0]);
  const filter = useMotionTemplate`brightness(${brightness})`;

  return (
    <motion.div
      style={{ scale, filter, zIndex }}
      className={`flex-shrink-0 w-[96px] h-24 rounded-lg border-2 ${item.border} ${item.color} backdrop-blur-md flex flex-col items-center justify-center relative overflow-hidden`}
    >
      {['Classified', 'Covert', 'Rare Special'].includes(item.rarity) && (
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.4)_0%,transparent_70%)] animate-pulse" />
      )}
      <motion.div style={{ opacity: glowOpacity }} className="absolute inset-0 border-4 border-white rounded-lg pointer-events-none mix-blend-overlay" />
      <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent opacity-50" />
      <Package className="w-8 h-8 text-white/90 mb-1 drop-shadow-md relative z-10" />
      <span className="text-xs font-bold text-white drop-shadow-md relative z-10">{item.name}</span>
    </motion.div>
  );
}

interface RoulettePanelProps {
  isSpinning: boolean;
  showResult: boolean;
  wonItem: PrizeViewItem | null;
  rouletteItems: PrizeViewItem[];
  targetX: number;
  x: MotionValue<number>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  onSpinComplete: () => void;
  onClose: () => void;
}

export function RoulettePanel({
  isSpinning, showResult, wonItem, rouletteItems,
  targetX, x, containerRef, onSpinComplete, onClose,
}: RoulettePanelProps) {
  // 避免从「开启宝箱」抬手瞬间误触刚出现的「返回」
  const [backReady, setBackReady] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setBackReady(true), 350);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="fixed inset-0 w-screen h-screen flex flex-col items-center justify-center bg-background overflow-hidden z-50">
      {/* 网格背景 */}
      <div className="absolute inset-0 opacity-20 pointer-events-none">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#4f4f4f2e_1px,transparent_1px),linear-gradient(to_bottom,#4f4f4f2e_1px,transparent_1px)] bg-[size:14px_24px]" />
        <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-40 bg-tg-secondary-bg shadow-[0_0_50px_rgba(0,0,0,0.8)] border-y border-foreground/10" />
      </div>

      {!isSpinning && !showResult && backReady && (
        <button
          type="button"
          onClick={onClose}
          className="absolute left-4 text-tg-hint hover:text-foreground flex items-center gap-2 z-20 mt-4 top-[calc(var(--tg-safe-area-inset-top,0px)+1.5rem)]"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>返回</span>
        </button>
      )}

      <div className="relative w-full max-w-md mx-auto z-10" ref={containerRef}>
        {/* 红色指针 */}
        <div className="absolute left-1/2 top-0 bottom-0 w-1 bg-red-500 -translate-x-1/2 z-20 shadow-[0_0_15px_rgba(239,68,68,1)]" />
        <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1 w-4 h-4 bg-red-500 rotate-45 z-20" />
        <div className="absolute left-1/2 bottom-0 -translate-x-1/2 translate-y-1 w-4 h-4 bg-red-500 rotate-45 z-20" />

        <div
          className="overflow-hidden h-32 relative w-full"
          style={{
            maskImage: 'linear-gradient(to right, transparent 0%, black 20%, black 80%, transparent 100%)',
            WebkitMaskImage: 'linear-gradient(to right, transparent 0%, black 20%, black 80%, transparent 100%)',
          }}
        >
          <motion.div
            className="flex items-center h-full gap-1 px-[50%]"
            style={{ x }}
            initial={{ x: 0 }}
            animate={{ x: isSpinning ? targetX : 0 }}
            transition={{ duration: 7, ease: [0.13, 0.99, 0.22, 1], onComplete: onSpinComplete }}
          >
            {rouletteItems.map((item, idx) => (
              <RouletteItem key={idx} item={item} idx={idx} x={x} itemWidth={100} />
            ))}
          </motion.div>
        </div>
      </div>

      <ResultModal showResult={showResult} wonItem={wonItem} onClose={onClose} />
    </div>
  );
}
