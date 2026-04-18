'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Package } from 'lucide-react';
import { useTelegramAuth } from '@/hooks/useTelegramAuth';
import { useUserStore } from '@/store/useUserStore';
import { useChestStore } from '@/store/useChestStore';
import { useOpenChest, CHEST_ICON_MAP, type UserChestInstance } from '@/hooks/useOpenChest';
import { RoulettePanel } from './chest/RoulettePanel';

const spring = { type: 'spring' as const, stiffness: 300, damping: 30 };

function wrapIndex(idx: number, len: number) {
  return ((idx % len) + len) % len;
}

function getRelativeOffset(idx: number, current: number, len: number) {
  const raw = idx - current;
  const half = Math.floor(len / 2);
  let offset = raw;
  if (offset > half) offset -= len;
  if (offset < -half) offset += len;
  return offset;
}

export default function ChestView() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const { isSyncing } = useTelegramAuth();
  const initData = useUserStore((s) => s.initData);
  const { chests, isLoading: isLoadingChests, error: chestLoadError, hasLoaded, loadOnce } = useChestStore();
  const [userChests, setUserChests] = useState<UserChestInstance[]>([]);

  const currentChest = userChests.length > 0 ? userChests[currentIndex] : null;
  const {
    isOpening,
    isOpeningPending,
    isSpinning,
    showResult,
    wonItem,
    rouletteItems,
    targetX,
    x,
    containerRef,
    actionError,
    startOpen,
    resetState,
    handleSpinComplete,
  } = useOpenChest(currentChest);

  useEffect(() => {
    if (isSyncing || !initData || hasLoaded) return;
    loadOnce(initData).catch((e) => console.error(e));
  }, [isSyncing, initData, hasLoaded, loadOnce]);

  useEffect(() => {
    const instances: UserChestInstance[] = [];
    if (Array.isArray(chests) && chests.length > 0) {
      chests.forEach((chest) => {
        for (let i = 0; i < chest.quantity; i++) {
          instances.push({
            ...chest,
            quantity: 1,
            uniqueId: `${chest.case_id}-${i}`,
            icon: CHEST_ICON_MAP[chest.case_key] || Package,
          });
        }
      });
    }
    setUserChests(instances);
    setCurrentIndex((prev) => Math.max(0, Math.min(prev, instances.length - 1)));
  }, [chests]);

  const handleNext = () => {
    if (isOpening || isOpeningPending || userChests.length === 0) return;
    setCurrentIndex((prev) => (prev + 1) % userChests.length);
  };

  const handlePrev = () => {
    if (isOpening || isOpeningPending || userChests.length === 0) return;
    setCurrentIndex((prev) => (prev - 1 + userChests.length) % userChests.length);
  };

  if (isOpening) {
    return (
      <RoulettePanel
        isSpinning={isSpinning}
        showResult={showResult}
        wonItem={wonItem}
        rouletteItems={rouletteItems}
        targetX={targetX}
        x={x}
        containerRef={containerRef}
        onSpinComplete={handleSpinComplete}
        onClose={resetState}
      />
    );
  }

  if (isLoadingChests || isSyncing) {
    return (
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-white text-lg animate-pulse">加载宝箱中...</div>
      </div>
    );
  }

  if (chestLoadError) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center px-4">
        <Package className="w-20 h-20 text-zinc-700 mb-4" />
        <h2 className="text-xl font-bold text-white mb-2">加载失败</h2>
        <p className="text-zinc-400 text-center mb-6">{chestLoadError}</p>
        <button
          onClick={() => window.location.reload()}
          className="px-6 py-3 rounded-xl font-bold text-white bg-zinc-800/80 backdrop-blur-md hover:bg-zinc-700/80 border border-zinc-600 transition-colors shadow-lg active:scale-95"
        >
          刷新重试
        </button>
      </div>
    );
  }

  if (userChests.length === 0) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center px-4">
        <Package className="w-24 h-24 text-zinc-700 mb-4" />
        <h2 className="text-2xl font-bold text-white mb-2">暂无宝箱</h2>
        <p className="text-zinc-400 text-center">您目前没有任何宝箱，快去获取一些吧！</p>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-between px-4 py-6 overflow-hidden">
      <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-gradient-to-br ${currentChest?.color || ''} rounded-full blur-3xl opacity-20 transition-colors duration-500 transform-gpu will-change-transform`} />

      <div className="text-center z-10 shrink-0 mt-2">
        <h2 className="text-2xl font-bold text-white mb-1">选择宝箱</h2>
        <p className="text-gray-400 text-sm">滑动或点击切换不同类型的宝箱</p>
      </div>

      {actionError ? (
        <div className="shrink-0 z-10 w-full max-w-sm mb-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {actionError}
        </div>
      ) : null}

      {/* 宝箱展示区（Cover Flow 样式） */}
      <div className="relative w-full h-64 flex items-center justify-center z-10 shrink-0 my-auto">
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center z-30">
          <div className="w-48 h-56 rounded-2xl border-2 border-white/30 shadow-[0_0_25px_rgba(255,255,255,0.12)]" />
        </div>

        <motion.div
          className="relative w-full h-full flex items-center justify-center"
          style={{ touchAction: 'pan-y' }}
          drag="x"
          dragDirectionLock
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.2}
          onDragEnd={(_, { offset, velocity }) => {
            const power = Math.abs(offset.x) * velocity.x;
            if (power < -8000) handleNext();
            else if (power > 8000) handlePrev();
          }}
        >
          {userChests.map((chest, idx) => {
            const offset = getRelativeOffset(idx, currentIndex, userChests.length);
            const isCenter = offset === 0;
            const absOffset = Math.abs(offset);
            const isVisible = absOffset <= 2;
            const opacity = isCenter ? 1 : absOffset === 1 ? 0.55 : absOffset === 2 ? 0.28 : 0;
            const scale = isCenter ? 1 : absOffset === 1 ? 0.78 : 0.62;
            const zIndex = isCenter ? 20 : absOffset === 1 ? 10 : absOffset === 2 ? 5 : 0;
            const rotateY = offset === 0 ? 0 : Math.max(-55, Math.min(55, -offset * 22));
            const ChestIcon = chest.icon;

            return (
              <motion.button
                key={chest.uniqueId}
                type="button"
                onClick={() => {
                  if (isOpening || isOpeningPending || idx === currentIndex) return;
                  setCurrentIndex(wrapIndex(idx, userChests.length));
                }}
                className="absolute w-48 h-56 rounded-2xl bg-gradient-to-b from-white/10 to-white/5 backdrop-blur-md flex flex-col items-center justify-center p-6 shadow-xl transform-gpu will-change-transform focus:outline-none"
                style={{ zIndex, transformPerspective: 1200, pointerEvents: isVisible ? 'auto' : 'none' }}
                initial={false}
                animate={{ opacity, scale, x: `${offset * 85}%`, rotateY, z: isCenter ? 50 : absOffset === 1 ? 10 : 0, transition: spring }}
                whileTap={{ scale: isCenter ? 0.98 : scale }}
              >
                <div className={['absolute inset-0 rounded-2xl pointer-events-none', isCenter ? chest.shadow : ''].join(' ')} />
                <div className={`w-20 h-20 rounded-xl bg-gradient-to-br ${chest.color} flex items-center justify-center mb-4 shadow-inner`}>
                  <ChestIcon className="w-10 h-10 text-white" />
                </div>
                <h3 className="text-xl font-bold text-white mb-1">{chest.name}</h3>
                <p className="text-xs text-gray-300 text-center">{chest.description}</p>
              </motion.button>
            );
          })}
        </motion.div>

        {userChests.length > 1 && (
          <>
            <button onClick={handlePrev} className="absolute left-0 sm:left-4 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center backdrop-blur-sm border border-white/20 text-white hover:bg-white/20 transition-colors z-40">&#10094;</button>
            <button onClick={handleNext} className="absolute right-0 sm:right-4 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center backdrop-blur-sm border border-white/20 text-white hover:bg-white/20 transition-colors z-40">&#10095;</button>
          </>
        )}
      </div>

      {/* 底部价格与开箱按钮 */}
      <div className="flex flex-col items-center gap-3 z-10 w-full max-w-[280px] shrink-0 mb-4">
        <div className="relative h-11 w-full flex items-center justify-center">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={currentChest?.case_id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: { duration: 0.18 } }}
              exit={{ opacity: 0, transition: { duration: 0.12 } }}
              className="absolute inset-0 flex items-center justify-center"
            >
              <div className="flex items-center gap-2 text-lg font-bold text-white bg-black/30 px-6 py-2 rounded-full border border-white/10">
                <span>开启需要:</span>
                <span className="text-green-400">{currentChest?.price} 叶子</span>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        <button
          onClick={startOpen}
          disabled={isOpening || isOpeningPending}
          className={`w-full py-4 rounded-xl font-bold text-lg text-white bg-gradient-to-r ${currentChest?.color || ''} hover:opacity-90 transition-opacity shadow-lg ${currentChest?.shadow || ''} disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {isOpeningPending ? '开启中...' : '开启宝箱'}
        </button>
      </div>
    </div>
  );
}
