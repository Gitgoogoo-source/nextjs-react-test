'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Package, Leaf } from 'lucide-react';
import { useTelegramAuth } from '@/hooks/useTelegramAuth';
import { useUserStore } from '@/store/useUserStore';
import { useChestStore } from '@/store/useChestStore';
import { useOpenChest, CHEST_ICON_MAP, type UserChestInstance } from '@/hooks/useOpenChest';
import { RoulettePanel } from './chest/RoulettePanel';
import { ShopSection } from './ShopView';

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
  const userBalance = useUserStore((s) => s.balance);
  const { chests, isLoading: isLoadingChests, error: chestLoadError, hasLoaded, loadOnce } = useChestStore();
  const [userChests, setUserChests] = useState<UserChestInstance[]>([]);

  const currentChest = userChests.length > 0 ? userChests[currentIndex] : null;
  const {
    isOpening,
    isOpeningPending,
    openMode,
    isSpinning,
    showResult,
    wonItem,
    wonItems,
    rouletteItems,
    batchRouletteStrips,
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
    // 每种 case_id 一行已由后端聚合 quantity；UI 只渲染一种宝箱一张卡，用数量角标表示库存，勿按 quantity 展开成多张重复卡
    const byType: UserChestInstance[] = [];
    if (Array.isArray(chests) && chests.length > 0) {
      chests.forEach((chest) => {
        byType.push({
          ...chest,
          quantity: chest.quantity,
          uniqueId: chest.case_id,
          icon: CHEST_ICON_MAP[chest.case_key] || Package,
        });
      });
    }
    setUserChests(byType);
    setCurrentIndex((prev) => Math.max(0, Math.min(prev, byType.length - 1)));
  }, [chests]);

  const handleNext = () => {
    if (isOpening || isOpeningPending || userChests.length === 0) return;
    setCurrentIndex((prev) => (prev + 1) % userChests.length);
  };

  const handlePrev = () => {
    if (isOpening || isOpeningPending || userChests.length === 0) return;
    setCurrentIndex((prev) => (prev - 1 + userChests.length) % userChests.length);
  };

  const currentChestQuantity = currentChest
    ? (chests.find((c) => c.case_id === currentChest.case_id)?.quantity ?? 0)
    : 0;
  const price = currentChest?.price ?? 0;
  const bal = Number(userBalance ?? 0);

  const canSingle = currentChestQuantity >= 1 && bal >= price;
  const canBatch = currentChestQuantity >= 1 && bal >= price * 10;

  if (isOpening) {
    return (
      <RoulettePanel
        mode={openMode}
        isSpinning={isSpinning}
        showResult={showResult}
        wonItem={wonItem}
        wonItems={wonItems}
        rouletteItems={rouletteItems}
        batchRouletteStrips={batchRouletteStrips}
        targetX={targetX}
        x={x}
        containerRef={containerRef}
        onSpinComplete={handleSpinComplete}
        onClose={resetState}
      />
    );
  }

  return (
    // min-h-full：至少撑满主内容区高度，便于按 2:1 分配；内容更高时整块变长由外层滚动
    <div className="flex min-h-full min-w-0 w-full flex-1 flex-col">
      {/* 开箱区域：占主内容区（顶栏与底栏之间）高度的约 2/3 */}
      <section className="relative flex flex-[2_1_0%] flex-col border-b border-white/10">
        {isLoadingChests || isSyncing ? (
          <div className="flex flex-1 flex-col items-center justify-center px-4 py-8">
            <div className="text-white text-lg animate-pulse">加载宝箱中...</div>
          </div>
        ) : chestLoadError ? (
          <div className="flex flex-1 flex-col items-center justify-center px-4 py-8 text-center">
            <Package className="w-16 h-16 text-zinc-700 mb-3" />
            <h2 className="text-lg font-bold text-white mb-1">加载失败</h2>
            <p className="text-zinc-400 text-sm mb-4">{chestLoadError}</p>
            <button
              type="button"
              onClick={() => (initData ? void loadOnce(initData) : window.location.reload())}
              className="px-5 py-2.5 rounded-xl font-bold text-sm text-white bg-zinc-800/80 backdrop-blur-md hover:bg-zinc-700/80 border border-zinc-600 transition-colors shadow-lg active:scale-95"
            >
              重试
            </button>
          </div>
        ) : userChests.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center px-4 py-8 text-center">
            <Package className="w-16 h-16 text-zinc-700 mb-3" />
            <h2 className="text-xl font-bold text-white mb-1">暂无宝箱</h2>
            <p className="text-zinc-400 text-sm max-w-[280px]">
              您目前没有任何宝箱，可在下方商城购买宝箱与其他道具。
            </p>
          </div>
        ) : (
          <div className="relative flex flex-col px-4 pt-3 pb-5">
            <div
              className={`absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-56 h-56 bg-gradient-to-br ${currentChest?.color || ''} rounded-full blur-3xl opacity-20 transition-colors duration-500 transform-gpu will-change-transform`}
            />

            <div className="flex items-start w-full z-10 shrink-0">
              <div>
                <h2 className="text-xl font-bold text-white">当前宝箱</h2>
              </div>
            </div>

            {actionError ? (
              <div className="shrink-0 z-10 w-full max-w-sm mt-1 mb-1 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                {actionError}
              </div>
            ) : null}

            <div className="relative z-10 my-2 flex min-h-[160px] w-full max-w-md shrink-0 items-center justify-center sm:min-h-[200px]">
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center z-30">
                <div className="w-40 h-48 rounded-2xl border-2 border-white/30 shadow-[0_0_25px_rgba(255,255,255,0.12)]" />
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
                      className="absolute w-40 h-48 rounded-2xl bg-gradient-to-b from-white/10 to-white/5 backdrop-blur-md flex flex-col items-center justify-center p-4 shadow-xl transform-gpu will-change-transform focus:outline-none"
                      style={{ zIndex, transformPerspective: 1200, pointerEvents: isVisible ? 'auto' : 'none' }}
                      initial={false}
                      animate={{
                        opacity,
                        scale,
                        x: `${offset * 85}%`,
                        rotateY,
                        z: isCenter ? 50 : absOffset === 1 ? 10 : 0,
                        transition: spring,
                      }}
                      whileTap={{ scale: isCenter ? 0.98 : scale }}
                    >
                      <div className={['absolute inset-0 rounded-2xl pointer-events-none', isCenter ? chest.shadow : ''].join(' ')} />
                      <div className="relative w-16 h-16 mb-2">
                        <div className={`w-16 h-16 rounded-xl bg-gradient-to-br ${chest.color} flex items-center justify-center shadow-inner`}>
                          <ChestIcon className="w-8 h-8 text-white" />
                        </div>
                        {chest.quantity > 1 ? (
                          <span className="absolute -top-1 -right-1 min-w-[1.25rem] px-1 py-0.5 rounded-full bg-zinc-900/90 border border-white/25 text-[10px] font-bold text-white text-center leading-none shadow">
                            ×{chest.quantity}
                          </span>
                        ) : null}
                      </div>
                      <h3 className="text-base font-bold text-white mb-0.5 line-clamp-1">{chest.name}</h3>
                      <p className="text-[10px] text-gray-300 text-center line-clamp-2 px-1">{chest.description}</p>
                      {isCenter && (
                        <p className="text-[10px] text-zinc-400 mt-1">
                          库存 {currentChestQuantity} 个
                        </p>
                      )}
                    </motion.button>
                  );
                })}
              </motion.div>

              {userChests.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={handlePrev}
                    className="absolute left-0 w-9 h-9 rounded-full bg-white/10 flex items-center justify-center backdrop-blur-sm border border-white/20 text-white hover:bg-white/20 transition-colors z-40 text-sm"
                  >
                    &#10094;
                  </button>
                  <button
                    type="button"
                    onClick={handleNext}
                    className="absolute right-0 w-9 h-9 rounded-full bg-white/10 flex items-center justify-center backdrop-blur-sm border border-white/20 text-white hover:bg-white/20 transition-colors z-40 text-sm"
                  >
                    &#10095;
                  </button>
                </>
              )}
            </div>

            <div className="z-10 mx-auto mt-3 flex w-full max-w-[320px] shrink-0 flex-col items-center gap-2">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={currentChest?.case_id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1, transition: { duration: 0.18 } }}
                  exit={{ opacity: 0, transition: { duration: 0.12 } }}
                  className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs font-medium text-zinc-400"
                >
                  <span>
                    单次消耗 <span className="text-green-400 font-bold">{price}</span> 叶子
                  </span>
                  <span className="text-zinc-600" aria-hidden>
                    ·
                  </span>
                  <span>
                    十连消耗 <span className="text-green-400 font-bold">{price * 10}</span> 叶子
                  </span>
                </motion.div>
              </AnimatePresence>

              <div className="flex gap-2 w-full">
                <button
                  type="button"
                  onClick={() => startOpen('single')}
                  disabled={isOpening || isOpeningPending || !canSingle}
                  className="flex-1 py-3 rounded-xl font-bold text-sm text-zinc-900 bg-[#f5f0e8] hover:bg-[#ede5d5] transition-colors shadow disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1"
                >
                  <span>单开</span>
                  <span className="flex items-center gap-0.5 text-xs text-green-700">
                    <Leaf className="w-3 h-3 fill-green-600 text-green-600" />
                    {price}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => startOpen('batch')}
                  disabled={isOpening || isOpeningPending || !canBatch}
                  className={`flex-1 py-3 rounded-xl font-bold text-sm text-white transition-colors shadow disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1 bg-gradient-to-r ${currentChest?.color || 'from-zinc-700 to-zinc-900'} hover:opacity-90`}
                >
                  {isOpeningPending ? (
                    <span className="animate-pulse">开启中...</span>
                  ) : (
                    <>
                      <span>十连开</span>
                      <span className="flex items-center gap-0.5 bg-white/20 rounded-full px-1.5 py-0.5 text-[10px] font-bold">
                        <Leaf className="w-2.5 h-2.5 fill-green-300 text-green-300" />
                        {price * 10}
                      </span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* 商城区域：占主内容区高度的约 1/3，与开箱区同一滚动容器内同步移动 */}
      <section className="flex flex-[1_1_0%] flex-col">
        <ShopSection />
      </section>
    </div>
  );
}
