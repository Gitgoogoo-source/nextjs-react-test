'use client';

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Package, Sparkles, Crown, ArrowLeft } from 'lucide-react';

const CHEST_TYPES = [
  {
    id: 'normal',
    name: '普通宝箱',
    color: 'from-blue-400 to-blue-600',
    shadow: 'shadow-blue-500/50',
    icon: Package,
    price: 100,
    description: '包含基础物品和普通鸭子',
  },
  {
    id: 'rare',
    name: '稀有宝箱',
    color: 'from-purple-400 to-purple-600',
    shadow: 'shadow-purple-500/50',
    icon: Sparkles,
    price: 500,
    description: '高概率获得稀有物品和特殊鸭子',
  },
  {
    id: 'exclusive',
    name: '绝版宝箱',
    color: 'from-red-400 to-orange-500',
    shadow: 'shadow-red-500/50',
    icon: Crown,
    price: 2000,
    description: '必定获得极其珍贵的绝版物品',
  }
];

const MOCK_PRIZES = [
  { id: 1, name: '普通鸭子', color: 'bg-blue-500/80', border: 'border-blue-400', rarity: 'Normal' },
  { id: 2, name: '稀有鸭子', color: 'bg-purple-500/80', border: 'border-purple-400', rarity: 'Rare' },
  { id: 3, name: '史诗鸭子', color: 'bg-pink-500/80', border: 'border-pink-400', rarity: 'Epic' },
  { id: 4, name: '传说鸭子', color: 'bg-yellow-500/80', border: 'border-yellow-400', rarity: 'Legendary' },
  { id: 5, name: '绝版鸭子', color: 'bg-red-500/80', border: 'border-red-400', rarity: 'Mythic' },
];

export default function ChestView() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [direction, setDirection] = useState(0);
  const [isOpening, setIsOpening] = useState(false);
  
  // 轮盘状态
  const [rouletteItems, setRouletteItems] = useState<typeof MOCK_PRIZES>([]);
  const [isSpinning, setIsSpinning] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [wonItem, setWonItem] = useState<typeof MOCK_PRIZES[0] | null>(null);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const [targetX, setTargetX] = useState(0);

  const handleNext = () => {
    if (isOpening) return;
    setDirection(1);
    setCurrentIndex((prev) => (prev + 1) % CHEST_TYPES.length);
  };

  const handlePrev = () => {
    if (isOpening) return;
    setDirection(-1);
    setCurrentIndex((prev) => (prev - 1 + CHEST_TYPES.length) % CHEST_TYPES.length);
  };

  const currentChest = CHEST_TYPES[currentIndex];
  const Icon = currentChest.icon;

  const startOpen = () => {
    setIsOpening(true);
    setShowResult(false);
    setIsSpinning(false);
    
    // 生成 50 个物品
    const items = Array.from({ length: 50 }).map(() => {
      return MOCK_PRIZES[Math.floor(Math.random() * MOCK_PRIZES.length)];
    });
    
    // 设定第 45 个为中奖物品 (索引 44)
    const winIndex = 44;
    const winner = items[winIndex];
    
    setRouletteItems(items);
    setWonItem(winner);

    // 延迟一小段时间后开始动画，确保 DOM 渲染完成
    setTimeout(() => {
      if (containerRef.current) {
        const containerWidth = containerRef.current.offsetWidth;
        const itemWidth = 100; // w-24 = 96px + 4px gap = 100px
        
        // 使用 px-[50%] 后，第一个物品的左侧边缘正好在容器中心。
        // 因此第 winIndex 个物品的中心点相对于初始中心点的偏移量就是：
        const centerOffset = (winIndex * itemWidth) + (itemWidth / 2);
        
        // 加上一个随机偏移量，让指针不总是停在物品正中央 (-30 到 30)
        const randomOffset = Math.floor(Math.random() * 60) - 30;
        const finalX = -centerOffset + randomOffset;
        
        setTargetX(finalX);
        setIsSpinning(true);
      }
    }, 100);
  };

  const resetState = () => {
    setIsOpening(false);
    setShowResult(false);
    setIsSpinning(false);
    setRouletteItems([]);
  };

  const variants: any = {
    enter: (direction: number) => ({
      x: direction > 0 ? 200 : -200,
      opacity: 0,
      scale: 0.8,
    }),
    center: {
      x: 0,
      opacity: 1,
      scale: 1,
      transition: {
        type: 'spring',
        stiffness: 300,
        damping: 30,
      }
    },
    exit: (direction: number) => ({
      x: direction < 0 ? 200 : -200,
      opacity: 0,
      scale: 0.8,
      transition: {
        duration: 0.2
      }
    })
  };

  if (isOpening) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950 overflow-hidden">
        {/* 工业/科技风背景 */}
        <div className="absolute inset-0 opacity-20 pointer-events-none">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#4f4f4f2e_1px,transparent_1px),linear-gradient(to_bottom,#4f4f4f2e_1px,transparent_1px)] bg-[size:14px_24px]" />
          <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-40 bg-zinc-900 shadow-[0_0_50px_rgba(0,0,0,0.8)] border-y border-zinc-800" />
        </div>

        {/* 顶部返回按钮 */}
        {!isSpinning && !showResult && (
          <button 
            onClick={resetState}
            className="absolute top-6 left-4 text-zinc-400 hover:text-white flex items-center gap-2 z-20"
          >
            <ArrowLeft className="w-5 h-5" />
            <span>返回</span>
          </button>
        )}

        <div className="relative w-full max-w-md mx-auto z-10" ref={containerRef}>
          {/* 红色发光指针 */}
          <div className="absolute left-1/2 top-0 bottom-0 w-1 bg-red-500 -translate-x-1/2 z-20 shadow-[0_0_15px_rgba(239,68,68,1)]" />
          
          {/* 指针上下的小三角形 */}
          <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1 w-4 h-4 bg-red-500 rotate-45 z-20" />
          <div className="absolute left-1/2 bottom-0 -translate-x-1/2 translate-y-1 w-4 h-4 bg-red-500 rotate-45 z-20" />

          {/* 滚动容器 */}
          <div className="overflow-hidden h-32 relative mask-edges">
            {/* 渐变遮罩，让边缘变暗 */}
            <div className="absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-zinc-950 to-transparent z-10" />
            <div className="absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-zinc-950 to-transparent z-10" />

            <motion.div 
              className="flex items-center h-full gap-1 px-[50%]"
              initial={{ x: 0 }}
              animate={{ x: isSpinning ? targetX : 0 }}
              transition={{ 
                duration: 7, 
                ease: [0.13, 0.99, 0.22, 1], // 极强重量感的缓动曲线
                onComplete: () => setShowResult(true)
              }}
            >
              {rouletteItems.map((item, idx) => (
                <div 
                  key={idx} 
                  className={`flex-shrink-0 w-[96px] h-24 rounded-lg border-2 ${item.border} ${item.color} flex flex-col items-center justify-center shadow-inner relative overflow-hidden`}
                >
                  {/* 物品内部的光泽 */}
                  <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent opacity-50" />
                  <Package className="w-8 h-8 text-white/90 mb-1" />
                  <span className="text-xs font-bold text-white drop-shadow-md">{item.name}</span>
                </div>
              ))}
            </motion.div>
          </div>
        </div>

        {/* 结果展示 */}
        <AnimatePresence>
          {showResult && wonItem && (
            <motion.div 
              initial={{ opacity: 0, y: 20, scale: 0.8 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              className="absolute bottom-20 flex flex-col items-center z-30"
            >
              <div className="text-zinc-400 mb-2 font-medium tracking-widest">获得物品</div>
              <div className={`text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r ${currentChest.color} drop-shadow-[0_0_10px_rgba(255,255,255,0.3)] mb-6`}>
                {wonItem.name}
              </div>
              <button 
                onClick={resetState}
                className="px-8 py-3 rounded-xl font-bold text-white bg-zinc-800 hover:bg-zinc-700 border border-zinc-600 transition-colors shadow-lg"
              >
                确认
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center px-4 overflow-hidden">
      {/* 背景光效 */}
      <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-gradient-to-br ${currentChest.color} rounded-full blur-3xl opacity-20 transition-colors duration-500 transform-gpu will-change-transform`} />

      <div className="text-center mb-12 z-10">
        <h2 className="text-2xl font-bold text-white mb-2">选择宝箱</h2>
        <p className="text-gray-400 text-sm">滑动或点击切换不同类型的宝箱</p>
      </div>

      {/* 宝箱展示区 */}
      <div className="relative w-full max-w-[280px] h-64 flex items-center justify-center z-10">
        <AnimatePresence initial={false} custom={direction} mode="popLayout">
          <motion.div
            key={currentIndex}
            custom={direction}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            drag="x"
            dragDirectionLock
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.5}
            style={{ touchAction: "none" }}
            onDragEnd={(e, { offset, velocity }) => {
              const swipe = Math.abs(offset.x) * velocity.x;
              if (swipe < -10000) {
                handleNext();
              } else if (swipe > 10000) {
                handlePrev();
              }
            }}
            className={`absolute w-48 h-56 rounded-2xl bg-gradient-to-b from-white/10 to-white/5 border border-white/20 backdrop-blur-md flex flex-col items-center justify-center p-6 cursor-grab active:cursor-grabbing shadow-xl ${currentChest.shadow} transform-gpu will-change-transform`}
          >
            <div className={`w-20 h-20 rounded-xl bg-gradient-to-br ${currentChest.color} flex items-center justify-center mb-4 shadow-inner`}>
              <Icon className="w-10 h-10 text-white" />
            </div>
            <h3 className="text-xl font-bold text-white mb-1">{currentChest.name}</h3>
            <p className="text-xs text-gray-300 text-center">{currentChest.description}</p>
          </motion.div>
        </AnimatePresence>

        {/* 左右切换按钮 */}
        <button 
          onClick={handlePrev}
          className="absolute -left-4 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center backdrop-blur-sm border border-white/20 text-white hover:bg-white/20 transition-colors z-20"
        >
          &#10094;
        </button>
        <button 
          onClick={handleNext}
          className="absolute -right-4 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center backdrop-blur-sm border border-white/20 text-white hover:bg-white/20 transition-colors z-20"
        >
          &#10095;
        </button>
      </div>

      {/* 底部操作区 */}
      <div className="mt-12 flex flex-col items-center gap-4 z-10 w-full max-w-[280px]">
        <div className="flex items-center gap-2 text-lg font-bold text-white bg-black/30 px-6 py-2 rounded-full border border-white/10">
          <span>开启需要:</span>
          <span className="text-green-400">{currentChest.price} 叶子</span>
        </div>
        
        <button 
          onClick={startOpen}
          className={`w-full py-4 rounded-xl font-bold text-lg text-white bg-gradient-to-r ${currentChest.color} hover:opacity-90 transition-opacity shadow-lg ${currentChest.shadow}`}
        >
          开启宝箱
        </button>
      </div>
    </div>
  );
}
