'use client';

import { useEffect, useRef, useState } from 'react';
import {
  motion,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
  useMotionTemplate,
  type MotionValue,
} from 'framer-motion';
import { Package, ArrowLeft } from 'lucide-react';
import { telegramHapticImpact } from '@/lib/telegram-haptics';
import { ResultModal } from './ResultModal';
import { MultiResultModal } from './MultiResultModal';
import type { PrizeViewItem } from '@/hooks/useOpenChest';
import type { OpenMode } from '@/hooks/useOpenChest';
import type { BatchRouletteStrip } from '@/hooks/useOpenChest';

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

  // 背景层单独随焦点 scale/brightness，文字与图标固定字号，避免随 transform 缩放
  return (
    <div className="relative flex h-24 w-[96px] flex-shrink-0 flex-col items-center justify-center">
      <motion.div
        style={{ scale, filter, zIndex }}
        className={`absolute inset-0 overflow-hidden rounded-lg border-2 ${item.border} ${item.color} backdrop-blur-md`}
      >
        {['Classified', 'Covert', 'Rare Special'].includes(item.rarity) && (
          <div className="absolute inset-0 animate-pulse bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.4)_0%,transparent_70%)]" />
        )}
        <motion.div
          style={{ opacity: glowOpacity }}
          className="pointer-events-none absolute inset-0 rounded-lg border-4 border-white mix-blend-overlay"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent opacity-50" />
      </motion.div>
      <Package className="relative z-10 mb-1 h-8 w-8 text-white/90 drop-shadow-md" />
      <span className="relative z-10 text-center text-app-caption font-bold text-white drop-shadow-md">{item.name}</span>
    </div>
  );
}

function playTickSound() {
  try {
    const w = window as unknown as { webkitAudioContext?: typeof AudioContext } & Window;
    const Ctor = window.AudioContext || w.webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.05);
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.05);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.05);
  } catch (e) {
    console.error('Audio play failed', e);
  }
}

function triggerHaptic() {
  try {
    telegramHapticImpact('light');
  } catch (e) {
    console.error('Haptic feedback failed', e);
  }
}

const ITEM_WIDTH = 100;

function RouletteStripRow({
  items,
  targetX,
  isSpinning,
  spinDuration,
  onComplete,
  tickEnabled,
}: {
  items: PrizeViewItem[];
  targetX: number;
  isSpinning: boolean;
  spinDuration: number;
  onComplete?: () => void;
  tickEnabled: boolean;
}) {
  const x = useMotionValue(0);
  const lastTickIndex = useRef(-1);
  const isSpinningRef = useRef(false);
  isSpinningRef.current = isSpinning;

  useMotionValueEvent(x, 'change', (latest) => {
    if (!tickEnabled || !isSpinningRef.current) return;
    const idx = Math.floor(Math.abs(latest) / ITEM_WIDTH);
    if (idx !== lastTickIndex.current) {
      lastTickIndex.current = idx;
      playTickSound();
      triggerHaptic();
    }
  });

  useEffect(() => {
    if (!isSpinning) lastTickIndex.current = -1;
  }, [isSpinning]);

  return (
    <div className="relative w-full shrink-0">
      <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-red-500 -translate-x-1/2 z-20 shadow-[0_0_8px_rgba(239,68,68,1)]" />
      <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1 w-2 h-2 bg-red-500 rotate-45 z-20" />
      <div className="absolute left-1/2 bottom-0 -translate-x-1/2 translate-y-1 w-2 h-2 bg-red-500 rotate-45 z-20" />
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
          transition={{ duration: spinDuration, ease: [0.13, 0.99, 0.22, 1], onComplete }}
        >
          {items.map((item, idx) => (
            <RouletteItem key={idx} item={item} idx={idx} x={x} itemWidth={ITEM_WIDTH} />
          ))}
        </motion.div>
      </div>
    </div>
  );
}

interface RoulettePanelProps {
  mode: OpenMode;
  isSpinning: boolean;
  showResult: boolean;
  wonItem: PrizeViewItem | null;
  wonItems: PrizeViewItem[];
  rouletteItems: PrizeViewItem[];
  batchRouletteStrips: BatchRouletteStrip[];
  targetX: number;
  x: MotionValue<number>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  onSpinComplete: () => void;
  onClose: () => void;
}

export function RoulettePanel({
  mode,
  isSpinning,
  showResult,
  wonItem,
  wonItems,
  rouletteItems,
  batchRouletteStrips,
  targetX,
  x,
  containerRef,
  onSpinComplete,
  onClose,
}: RoulettePanelProps) {
  const [backReady, setBackReady] = useState(false);
  const batchCompleteRef = useRef(0);
  const batchSpinDoneRef = useRef(false);

  useEffect(() => {
    const t = window.setTimeout(() => setBackReady(true), 350);
    return () => clearTimeout(t);
  }, []);

  const spinDuration = mode === 'batch' ? 2.5 : 7;

  useEffect(() => {
    batchCompleteRef.current = 0;
    batchSpinDoneRef.current = false;
  }, [batchRouletteStrips, mode]);

  const handleBatchStripComplete = () => {
    batchCompleteRef.current += 1;
    if (
      batchCompleteRef.current >= batchRouletteStrips.length &&
      !batchSpinDoneRef.current
    ) {
      batchSpinDoneRef.current = true;
      onSpinComplete();
    }
  };

  return (
    <div className="fixed inset-0 w-screen h-screen flex flex-col items-center justify-center bg-background overflow-hidden z-50">
      <div className="absolute inset-0 opacity-20 pointer-events-none">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#4f4f4f2e_1px,transparent_1px),linear-gradient(to_bottom,#4f4f4f2e_1px,transparent_1px)] bg-[size:14px_24px]" />
        <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-40 bg-tg-secondary-bg shadow-[0_0_50px_rgba(0,0,0,0.8)] border-y border-foreground/10" />
      </div>

      {!isSpinning && !showResult && backReady && (
        <button
          type="button"
          onClick={onClose}
          className="absolute left-4 top-[calc(var(--tg-safe-area-inset-top,0px)+1.5rem)] z-20 mt-4 flex items-center gap-2 text-app-body text-tg-hint hover:text-foreground"
        >
          <ArrowLeft className="h-5 w-5" />
          <span>返回</span>
        </button>
      )}

      {mode === 'batch' && (
        <div className="absolute right-4 top-[calc(var(--tg-safe-area-inset-top,0px)+1.5rem)] z-20 text-app-caption font-bold uppercase tracking-widest text-zinc-400">
          十连开
        </div>
      )}

      {mode === 'batch' && batchRouletteStrips.length > 0 ? (
        <div
          className="relative z-10 mx-auto flex min-h-0 w-full max-w-md flex-1 flex-col items-center justify-center overflow-y-auto px-2 pb-36 pt-14 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
          ref={containerRef}
        >
          <div className="flex w-full flex-col gap-0.5">
            {batchRouletteStrips.map((strip, i) => (
              <RouletteStripRow
                key={i}
                items={strip.items}
                targetX={strip.targetX}
                isSpinning={isSpinning}
                spinDuration={spinDuration}
                onComplete={handleBatchStripComplete}
                tickEnabled={i === 4}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="relative w-full max-w-md mx-auto z-10" ref={containerRef}>
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
              transition={{ duration: spinDuration, ease: [0.13, 0.99, 0.22, 1], onComplete: onSpinComplete }}
            >
              {rouletteItems.map((item, idx) => (
                <RouletteItem key={idx} item={item} idx={idx} x={x} itemWidth={ITEM_WIDTH} />
              ))}
            </motion.div>
          </div>
        </div>
      )}

      {mode === 'single' ? (
        <ResultModal showResult={showResult} wonItem={wonItem} onClose={onClose} />
      ) : (
        <MultiResultModal showResult={showResult} wonItems={wonItems} onClose={onClose} />
      )}
    </div>
  );
}
