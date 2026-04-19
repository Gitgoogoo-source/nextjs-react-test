'use client';

import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
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

const CHEST_UI_SCALE_MAX = 1.42;

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

  /** 开箱主体（轮盘 + 按钮）所在舞台：用于测量可用高度并按比例放大，吃掉与商城之间的空隙 */
  const chestStageRef = useRef<HTMLDivElement>(null);
  const chestMeasureRef = useRef<HTMLDivElement>(null);
  const [chestUiScale, setChestUiScale] = useState(1);

  const updateChestUiScale = useCallback(() => {
    const stage = chestStageRef.current;
    const measure = chestMeasureRef.current;
    if (!stage || !measure) return;
    const avail = stage.clientHeight;
    const natural = measure.offsetHeight;
    if (avail < 48 || natural < 48) return;
    const next = Math.min(CHEST_UI_SCALE_MAX, Math.max(1, (avail - 8) / natural));
    setChestUiScale((prev) => (Math.abs(prev - next) < 0.02 ? prev : next));
  }, []);

  useLayoutEffect(() => {
    const stage = chestStageRef.current;
    const measure = chestMeasureRef.current;
    if (!stage) return;
    updateChestUiScale();
    const ro = new ResizeObserver(() => {
      updateChestUiScale();
    });
    ro.observe(stage);
    if (measure) ro.observe(measure);
    return () => ro.disconnect();
  }, [updateChestUiScale, userChests.length, currentChest?.case_id, isLoadingChests, isSyncing, actionError]);

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
    // h-full + min-h-full：在顶栏与底栏之间的可视区域内撑满高度，便于 flex 2:1 真正生效；更长内容由外层滚动
    <div className="flex h-full min-h-0 min-w-0 w-full flex-1 flex-col">
      {/* 开箱区域：约占主内容区高度的 2/3；内层 flex-1 吃满，避免大块留白 */}
      <section className="relative flex min-h-0 flex-[2_1_0%] flex-col overflow-x-visible overflow-y-visible border-b border-white/10">
        {isLoadingChests || isSyncing ? (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-4 py-8">
            <div className="text-white text-lg animate-pulse">加载宝箱中...</div>
          </div>
        ) : chestLoadError ? (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-4 py-8 text-center">
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
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-4 py-8 text-center">
            <Package className="w-16 h-16 text-zinc-700 mb-3" />
            <h2 className="text-xl font-bold text-white mb-1">暂无宝箱</h2>
            <p className="text-zinc-400 text-sm max-w-[280px]">
              您目前没有任何宝箱，可在下方商城购买宝箱与其他道具。
            </p>
          </div>
        ) : (
          <div className="relative flex min-h-0 flex-1 flex-col px-4 pt-3 pb-3">
            <div
              className={`pointer-events-none absolute top-[28%] left-1/2 h-[min(14rem,42vmin)] w-[min(14rem,42vmin)] -translate-x-1/2 -translate-y-1/2 bg-gradient-to-br ${currentChest?.color || ''} rounded-full blur-3xl opacity-20 transition-colors duration-500 transform-gpu will-change-transform`}
            />

            <div className="relative z-10 flex w-full shrink-0 items-start">
              <div>
                <h2 className="text-xl font-bold text-white">当前宝箱</h2>
              </div>
            </div>

            {actionError ? (
              <div className="relative z-10 mt-1 mb-1 w-full max-w-sm shrink-0 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                {actionError}
              </div>
            ) : null}

            <div
              ref={chestStageRef}
              className="relative z-10 flex min-h-0 flex-1 flex-col items-center justify-center overflow-visible py-1"
            >
              <div
                className="w-full max-w-md origin-center will-change-transform"
                style={{
                  transform: `scale(${chestUiScale})`,
                }}
              >
                <div ref={chestMeasureRef} className="flex w-full max-w-md flex-col items-center">
                  <div className="relative z-10 my-2 flex min-h-[min(10rem,28svh)] w-full max-w-md shrink-0 items-center justify-center sm:min-h-[min(12rem,30svh)]">
                    <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
                      <div className="h-48 w-40 rounded-2xl border-2 border-white/30 shadow-[0_0_25px_rgba(255,255,255,0.12)]" />
                    </div>

                    <motion.div
                      className="relative flex h-full w-full items-center justify-center"
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
                            className="absolute flex h-48 w-40 flex-col items-center justify-center rounded-2xl bg-gradient-to-b from-white/10 to-white/5 p-4 shadow-xl backdrop-blur-md transform-gpu will-change-transform focus:outline-none"
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
                            <div
                              className={['pointer-events-none absolute inset-0 rounded-2xl', isCenter ? chest.shadow : ''].join(
                                ' '
                              )}
                            />
                            <div className="relative mb-2 h-16 w-16">
                              <div
                                className={`flex h-16 w-16 items-center justify-center rounded-xl bg-gradient-to-br ${chest.color} shadow-inner`}
                              >
                                <ChestIcon className="h-8 w-8 text-white" />
                              </div>
                              {chest.quantity > 1 ? (
                                <span className="absolute -top-1 -right-1 min-w-[1.25rem] rounded-full border border-white/25 bg-zinc-900/90 px-1 py-0.5 text-center text-[10px] font-bold leading-none text-white shadow">
                                  ×{chest.quantity}
                                </span>
                              ) : null}
                            </div>
                            <h3 className="mb-0.5 line-clamp-1 text-base font-bold text-white">{chest.name}</h3>
                            <p className="line-clamp-2 px-1 text-center text-[10px] text-gray-300">{chest.description}</p>
                            {isCenter && (
                              <p className="mt-1 text-[10px] text-zinc-400">库存 {currentChestQuantity} 个</p>
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
                          className="absolute left-0 z-40 flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-white/10 text-sm text-white backdrop-blur-sm transition-colors hover:bg-white/20"
                        >
                          &#10094;
                        </button>
                        <button
                          type="button"
                          onClick={handleNext}
                          className="absolute right-0 z-40 flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-white/10 text-sm text-white backdrop-blur-sm transition-colors hover:bg-white/20"
                        >
                          &#10095;
                        </button>
                      </>
                    )}
                  </div>

                  <div className="z-10 mx-auto mt-2 flex w-full max-w-[320px] shrink-0 flex-col items-center gap-2">
                    <AnimatePresence mode="wait" initial={false}>
                      <motion.div
                        key={currentChest?.case_id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1, transition: { duration: 0.18 } }}
                        exit={{ opacity: 0, transition: { duration: 0.12 } }}
                        className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs font-medium text-zinc-400"
                      >
                        <span>
                          单次消耗 <span className="font-bold text-green-400">{price}</span> 叶子
                        </span>
                        <span className="text-zinc-600" aria-hidden>
                          ·
                        </span>
                        <span>
                          十连消耗 <span className="font-bold text-green-400">{price * 10}</span> 叶子
                        </span>
                      </motion.div>
                    </AnimatePresence>

                    <div className="flex w-full gap-2">
                      <button
                        type="button"
                        onClick={() => startOpen('single')}
                        disabled={isOpening || isOpeningPending || !canSingle}
                        className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-[#f5f0e8] py-3 text-sm font-bold text-zinc-900 shadow transition-colors hover:bg-[#ede5d5] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <span>单开</span>
                        <span className="flex items-center gap-0.5 text-xs text-green-700">
                          <Leaf className="h-3 w-3 fill-green-600 text-green-600" />
                          {price}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => startOpen('batch')}
                        disabled={isOpening || isOpeningPending || !canBatch}
                        className={`flex flex-1 items-center justify-center gap-1 rounded-xl bg-gradient-to-r py-3 text-sm font-bold text-white shadow transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 ${currentChest?.color || 'from-zinc-700 to-zinc-900'}`}
                      >
                        {isOpeningPending ? (
                          <span className="animate-pulse">开启中...</span>
                        ) : (
                          <>
                            <span>十连开</span>
                            <span className="flex items-center gap-0.5 rounded-full bg-white/20 px-1.5 py-0.5 text-[10px] font-bold">
                              <Leaf className="h-2.5 w-2.5 fill-green-300 text-green-300" />
                              {price * 10}
                            </span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* 商城区域：约占主内容区高度的 1/3；min-h-0 避免 flex 子项撑破比例 */}
      <section className="flex min-h-0 flex-[1_1_0%] flex-col">
        <ShopSection />
      </section>
    </div>
  );
}
