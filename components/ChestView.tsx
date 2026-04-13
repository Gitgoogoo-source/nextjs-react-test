'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Package, Sparkles, Crown } from 'lucide-react';

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

export default function ChestView() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [direction, setDirection] = useState(0); // 1 for right, -1 for left

  const handleNext = () => {
    setDirection(1);
    setCurrentIndex((prev) => (prev + 1) % CHEST_TYPES.length);
  };

  const handlePrev = () => {
    setDirection(-1);
    setCurrentIndex((prev) => (prev - 1 + CHEST_TYPES.length) % CHEST_TYPES.length);
  };

  const currentChest = CHEST_TYPES[currentIndex];
  const Icon = currentChest.icon;

  const variants = {
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

  return (
    <div className="flex flex-col h-full w-full items-center justify-center relative px-4">
      {/* 背景光效 */}
      <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-gradient-to-br ${currentChest.color} rounded-full blur-[100px] opacity-20 transition-colors duration-500`} />

      <div className="text-center mb-12 z-10">
        <h2 className="text-2xl font-bold text-white mb-2">选择宝箱</h2>
        <p className="text-gray-400 text-sm">滑动或点击切换不同类型的宝箱</p>
      </div>

      {/* 宝箱展示区 (CSGO风格轮播) */}
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
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={1}
            onDragEnd={(e, { offset, velocity }) => {
              const swipe = swipePower(offset.x, velocity.x);
              if (swipe < -swipeConfidenceThreshold) {
                handleNext();
              } else if (swipe > swipeConfidenceThreshold) {
                handlePrev();
              }
            }}
            className={`absolute w-48 h-56 rounded-2xl bg-gradient-to-b from-white/10 to-white/5 border border-white/20 backdrop-blur-md flex flex-col items-center justify-center p-6 cursor-grab active:cursor-grabbing shadow-2xl ${currentChest.shadow}`}
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
        
        <button className={`w-full py-4 rounded-xl font-bold text-lg text-white bg-gradient-to-r ${currentChest.color} hover:opacity-90 transition-opacity shadow-lg ${currentChest.shadow}`}>
          开启宝箱
        </button>
      </div>
    </div>
  );
}

const swipeConfidenceThreshold = 10000;
const swipePower = (offset: number, velocity: number) => {
  return Math.abs(offset) * velocity;
};
