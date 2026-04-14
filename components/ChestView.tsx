'use client';

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform, useMotionTemplate, MotionValue, useMotionValueEvent } from 'framer-motion';
import { Package, Sparkles, Crown, ArrowLeft } from 'lucide-react';
import confetti from 'canvas-confetti';
import { useTelegramAuth } from '@/hooks/useTelegramAuth';

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

// CSGO 风格的稀有度颜色，修改为玻璃拟态 (Glassmorphism) 风格
const MOCK_PRIZES = [
  { id: 1, name: '军规级鸭子', color: 'bg-blue-500/20', border: 'border-blue-400/50', shadow: 'shadow-blue-500/50', rarity: 'Mil-Spec', hex: '#3b82f6' },
  { id: 2, name: '受限级鸭子', color: 'bg-purple-500/20', border: 'border-purple-400/50', shadow: 'shadow-purple-500/50', rarity: 'Restricted', hex: '#a855f7' },
  { id: 3, name: '保密级鸭子', color: 'bg-pink-500/20', border: 'border-pink-400/50', shadow: 'shadow-pink-500/50', rarity: 'Classified', hex: '#ec4899' },
  { id: 4, name: '隐秘级鸭子', color: 'bg-red-500/20', border: 'border-red-400/50', shadow: 'shadow-red-500/50', rarity: 'Covert', hex: '#ef4444' },
  { id: 5, name: '罕见级鸭子', color: 'bg-yellow-500/20', border: 'border-yellow-400/50', shadow: 'shadow-yellow-500/50', rarity: 'Rare Special', hex: '#eab308' },
];

// 播放短促的滴答声
const playTickSound = () => {
  try {
    const w = window as unknown as { webkitAudioContext?: typeof AudioContext } & Window;
    const AudioContextCtor = window.AudioContext || w.webkitAudioContext;
    if (!AudioContextCtor) return;
    const ctx = new AudioContextCtor();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.type = 'sine';
    // 频率设置得高一点，时间极短，产生类似 tick 的声音
    osc.frequency.setValueAtTime(800, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.05);
    
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.05);
    
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.05);
  } catch (e) {
    console.error('Audio play failed', e);
  }
};

// 触发 Telegram 震动
const triggerHaptic = () => {
  try {
    if (window.Telegram?.WebApp?.HapticFeedback) {
      window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
    }
  } catch (e) {
    console.error('Haptic feedback failed', e);
  }
};

// 单个轮盘物品组件
const RouletteItem = ({ item, idx, x, itemWidth }: { item: typeof MOCK_PRIZES[0], idx: number, x: MotionValue<number>, itemWidth: number }) => {
  // 当前物品的中心点偏移量
  const centerOffset = (idx * itemWidth) + (itemWidth / 2);
  
  // 当容器的 x 移动到 -centerOffset 时，该物品正好在屏幕正中央
  const range = [-centerOffset - itemWidth, -centerOffset, -centerOffset + itemWidth];
  
  // 缩放：在正中央时放大到 1.15 倍
  const scale = useTransform(x, range, [1, 1.15, 1]);
  // 亮度：在正中央时变亮
  const brightness = useTransform(x, range, [0.5, 1.2, 0.5]);
  // z-index：在正中央时置顶
  const zIndex = useTransform(x, range, [0, 10, 0]);
  // 边框发光透明度
  const glowOpacity = useTransform(x, range, [0, 1, 0]);

  const filter = useMotionTemplate`brightness(${brightness})`;

  return (
    <motion.div 
      style={{ scale, filter, zIndex }}
      className={`flex-shrink-0 w-[96px] h-24 rounded-lg border-2 ${item.border} ${item.color} backdrop-blur-md flex flex-col items-center justify-center relative overflow-hidden transition-shadow duration-100`}
    >
      {/* 稀有物品的背景流光效果 (Radial Gradient) */}
      {['Classified', 'Covert', 'Rare Special'].includes(item.rarity) && (
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.4)_0%,transparent_70%)] animate-pulse" />
      )}
      
      {/* 指针划过时的边框闪烁高亮 */}
      <motion.div 
        style={{ opacity: glowOpacity }}
        className="absolute inset-0 border-4 border-white rounded-lg pointer-events-none mix-blend-overlay"
      />

      {/* 物品内部的光泽 */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent opacity-50" />
      
      <Package className="w-8 h-8 text-white/90 mb-1 drop-shadow-md relative z-10" />
      <span className="text-xs font-bold text-white drop-shadow-md relative z-10">{item.name}</span>
    </motion.div>
  );
};

export default function ChestView() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isOpening, setIsOpening] = useState(false);
  const { isSyncing, error: authError, user: tgUser } = useTelegramAuth();
  
  // 用户的宝箱列表
  const [userChests, setUserChests] = useState<typeof CHEST_TYPES>([]);
  const [isLoadingChests, setIsLoadingChests] = useState(true);

  // 轮盘状态
  const [rouletteItems, setRouletteItems] = useState<typeof MOCK_PRIZES>([]);
  const [isSpinning, setIsSpinning] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [wonItem, setWonItem] = useState<typeof MOCK_PRIZES[0] | null>(null);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const [targetX, setTargetX] = useState(0);
  
  // 追踪容器的 X 轴位移，用于计算物品的高亮和触发音效
  const x = useMotionValue(0);
  const lastTickIndex = useRef(-1);

  // 获取用户宝箱数据
  useEffect(() => {
    async function fetchChests() {
      if (isSyncing) return;
      if (!tgUser?.id) {
        setIsLoadingChests(false);
        return;
      }

      try {
        const response = await fetch(`/api/chest/list?userId=${tgUser.id}`);
        if (!response.ok) throw new Error('Failed to fetch chests');
        
        const { chests } = await response.json();
        
        // 根据返回的数据生成宝箱列表
        const generatedChests: typeof CHEST_TYPES = [];
        
        if (chests && chests.length > 0) {
          chests.forEach((chestData: { case_id: string, quantity: number }) => {
            const baseChest = CHEST_TYPES.find(c => c.id === chestData.case_id);
            if (baseChest && chestData.quantity > 0) {
              // 根据数量生成对应个数的宝箱对象
              for (let i = 0; i < chestData.quantity; i++) {
                generatedChests.push({
                  ...baseChest,
                  // 为了在列表中区分不同的宝箱实例，添加一个唯一的 key
                  uniqueId: `${baseChest.id}-${i}`
                } as any);
              }
            }
          });
        }
        
        setUserChests(generatedChests);
      } catch (error) {
        console.error('Error fetching chests:', error);
      } finally {
        setIsLoadingChests(false);
      }
    }

    fetchChests();
  }, [isSyncing, tgUser?.id]);

  // 监听 X 轴变化，触发音效和震动
  useMotionValueEvent(x, "change", (latest) => {
    if (!isSpinning) return;
    
    const itemWidth = 100; // 每个物品的宽度 + gap
    // 计算当前指针指向的物品索引
    // 因为 x 是负数，所以取绝对值
    const currentPointerIndex = Math.floor(Math.abs(latest) / itemWidth);
    
    if (currentPointerIndex !== lastTickIndex.current) {
      lastTickIndex.current = currentPointerIndex;
      playTickSound();
      triggerHaptic();
    }
  });

  const handleNext = () => {
    if (isOpening || userChests.length === 0) return;
    setCurrentIndex((prev) => (prev + 1) % userChests.length);
  };

  const handlePrev = () => {
    if (isOpening || userChests.length === 0) return;
    setCurrentIndex((prev) => (prev - 1 + userChests.length) % userChests.length);
  };

  const currentChest = userChests.length > 0 ? userChests[currentIndex] : null;

  const startOpen = async () => {
    if (isOpening || !currentChest) return;
    setIsOpening(true);
    setShowResult(false);
    setIsSpinning(false);
    x.set(0); 
    lastTickIndex.current = -1;
    
    try {
      // 请求后端计算结果
      const response = await fetch('/api/chest/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chestId: currentChest.id, userId: tgUser?.id })
      });
      
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to open chest');
      }
      
      const { wonItemId, randomOffset } = await response.json();
      
      // 生成 50 个物品，前 44 个随机展示
      const items = Array.from({ length: 50 }).map((_, i) => {
        if (i === 44) {
          // 第 45 个 (索引 44) 是中奖物品
          return MOCK_PRIZES.find(p => p.id === wonItemId) || MOCK_PRIZES[0];
        }
        // 其他随机填充
        const rand = Math.random() * 100;
        if (rand < 50) return MOCK_PRIZES[0];
        if (rand < 75) return MOCK_PRIZES[1];
        if (rand < 90) return MOCK_PRIZES[2];
        if (rand < 98) return MOCK_PRIZES[3];
        return MOCK_PRIZES[4];
      });
      
      const winIndex = 44;
      const winner = items[winIndex];
      
      setRouletteItems(items);
      setWonItem(winner);

      setTimeout(() => {
        if (containerRef.current) {
          const itemWidth = 100; 
          const centerOffset = (winIndex * itemWidth) + (itemWidth / 2);
          // 使用后端返回的随机偏移量
          const finalX = -centerOffset + randomOffset;
          
          setTargetX(finalX);
          setIsSpinning(true);
        }
      }, 100);
      
    } catch (error: any) {
      console.error('Error:', error);
      setIsOpening(false);
      alert(error.message || '开启宝箱失败，请重试');
    }
  };

  const handleSpinComplete = () => {
    setShowResult(true);
    
    // 最终中奖时的强烈震动
    try {
      if (window.Telegram?.WebApp?.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
      }
    } catch {}
    
    if (wonItem) {
      const duration = 3000;
      const end = Date.now() + duration;

      const frame = () => {
        confetti({
          particleCount: 5,
          angle: 60,
          spread: 55,
          origin: { x: 0, y: 0.8 },
          colors: [wonItem.hex, '#ffffff']
        });
        confetti({
          particleCount: 5,
          angle: 120,
          spread: 55,
          origin: { x: 1, y: 0.8 },
          colors: [wonItem.hex, '#ffffff']
        });

        if (Date.now() < end) {
          requestAnimationFrame(frame);
        }
      };
      
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
        colors: [wonItem.hex, '#ffffff', '#facc15']
      });
      
      frame();
    }
  };

  const resetState = () => {
    setIsOpening(false);
    setShowResult(false);
    setIsSpinning(false);
    setRouletteItems([]);
    x.set(0);
    lastTickIndex.current = -1;
    
    // 重新获取宝箱列表以更新数量
    if (tgUser?.id) {
      fetch(`/api/chest/list?userId=${tgUser.id}`)
        .then(res => res.json())
        .then(({ chests }) => {
          const generatedChests: typeof CHEST_TYPES = [];
          if (chests && chests.length > 0) {
            chests.forEach((chestData: { case_id: string, quantity: number }) => {
              const baseChest = CHEST_TYPES.find(c => c.id === chestData.case_id);
              if (baseChest && chestData.quantity > 0) {
                for (let i = 0; i < chestData.quantity; i++) {
                  generatedChests.push({
                    ...baseChest,
                    uniqueId: `${baseChest.id}-${i}`
                  } as any);
                }
              }
            });
          }
          setUserChests(generatedChests);
          setCurrentIndex(prev => Math.max(0, Math.min(prev, generatedChests.length - 1)));
        })
        .catch(console.error);
    }
  };

  const wrapIndex = (idx: number, len: number) => ((idx % len) + len) % len;
  const getRelativeOffset = (idx: number, current: number, len: number) => {
    // 让 offset 落在 [-floor(len/2), floor(len/2)]，实现“环形”相邻关系
    const raw = idx - current;
    const half = Math.floor(len / 2);
    let offset = raw;
    if (offset > half) offset -= len;
    if (offset < -half) offset += len;
    return offset;
  };

  const spring = { type: 'spring' as const, stiffness: 300, damping: 30 };

  if (isOpening) {
    return (
      // 移动端全屏适配
      <div className="fixed inset-0 w-screen h-screen flex flex-col items-center justify-center bg-zinc-950 overflow-hidden z-50">
        {/* 工业/科技风背景 */}
        <div className="absolute inset-0 opacity-20 pointer-events-none">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#4f4f4f2e_1px,transparent_1px),linear-gradient(to_bottom,#4f4f4f2e_1px,transparent_1px)] bg-[size:14px_24px]" />
          <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-40 bg-zinc-900 shadow-[0_0_50px_rgba(0,0,0,0.8)] border-y border-zinc-800" />
        </div>

        {/* 顶部返回按钮 */}
        {!isSpinning && !showResult && (
          <button 
            onClick={resetState}
            className="absolute top-safe-offset-6 left-4 text-zinc-400 hover:text-white flex items-center gap-2 z-20 mt-4"
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
          <div 
            className="overflow-hidden h-32 relative w-full"
            style={{ 
              maskImage: 'linear-gradient(to right, transparent 0%, black 20%, black 80%, transparent 100%)',
              WebkitMaskImage: 'linear-gradient(to right, transparent 0%, black 20%, black 80%, transparent 100%)'
            }}
          >
            <motion.div 
              className="flex items-center h-full gap-1 px-[50%]"
              style={{ x }}
              initial={{ x: 0 }}
              animate={{ x: isSpinning ? targetX : 0 }}
              transition={{ 
                duration: 7, 
                ease: [0.13, 0.99, 0.22, 1], // 极强重量感的缓动曲线
                onComplete: handleSpinComplete
              }}
            >
              {rouletteItems.map((item, idx) => (
                <RouletteItem 
                  key={idx} 
                  item={item} 
                  idx={idx} 
                  x={x} 
                  itemWidth={100} 
                />
              ))}
            </motion.div>
          </div>
        </div>

        {/* 结果展示 */}
        <AnimatePresence>
          {showResult && wonItem && (
            <motion.div 
              initial={{ opacity: 0, y: 50, scale: 0.5 }}
              animate={{ opacity: 1, y: 0, scale: 1.2 }}
              transition={{ type: 'spring', bounce: 0.5, duration: 0.8 }}
              className="absolute bottom-1/4 flex flex-col items-center z-30"
            >
              {/* 物品背后的光晕 */}
              <div className={`absolute inset-0 blur-3xl opacity-40 ${wonItem.color.replace('/20', '')} rounded-full scale-150 -z-10`} />
              
              <div className="text-zinc-300 mb-2 font-medium tracking-widest text-sm uppercase">获得物品</div>
              
              <div className={`relative w-32 h-32 rounded-2xl border-4 ${wonItem.border.replace('/50', '')} ${wonItem.color} backdrop-blur-md flex flex-col items-center justify-center shadow-2xl mb-6 overflow-hidden`}>
                {['Classified', 'Covert', 'Rare Special'].includes(wonItem.rarity) && (
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.6)_0%,transparent_70%)] animate-spin-slow" />
                )}
                <div className="absolute inset-0 bg-gradient-to-br from-white/30 to-transparent opacity-50" />
                <Package className="w-16 h-16 text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.8)] relative z-10" />
              </div>

              <div className={`text-3xl font-black text-transparent bg-clip-text bg-gradient-to-b from-white to-zinc-400 drop-shadow-[0_0_10px_rgba(255,255,255,0.3)] mb-8`}>
                {wonItem.name}
              </div>
              
              <button 
                onClick={resetState}
                className="px-10 py-4 rounded-xl font-bold text-white bg-zinc-800/80 backdrop-blur-md hover:bg-zinc-700/80 border border-zinc-600 transition-colors shadow-lg active:scale-95"
              >
                收下物品
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  if (isLoadingChests || isSyncing) {
    return (
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-white text-lg animate-pulse">加载宝箱中...</div>
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
      {/* 背景光效 */}
      <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-gradient-to-br ${currentChest?.color || ''} rounded-full blur-3xl opacity-20 transition-colors duration-500 transform-gpu will-change-transform`} />

      <div className="text-center z-10 shrink-0 mt-2">
        <h2 className="text-2xl font-bold text-white mb-1">选择宝箱</h2>
        <p className="text-gray-400 text-sm">滑动或点击切换不同类型的宝箱</p>
      </div>

      {/* 宝箱展示区 */}
      <div className="relative w-full h-64 flex items-center justify-center z-10 shrink-0 my-auto">
        {/* 固定选中边框：不跟随滑动，只做选中强调 */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center z-30">
          <div className="w-48 h-56 rounded-2xl border-2 border-white/30 shadow-[0_0_25px_rgba(255,255,255,0.12)]" />
        </div>

        {/* 核心滑动区（宝箱动） */}
        <motion.div
          className="relative w-full h-full flex items-center justify-center"
          style={{ touchAction: 'pan-y' }}
          drag="x"
          dragDirectionLock
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.2}
          onDragEnd={(e, { offset, velocity }) => {
            const swipePower = Math.abs(offset.x) * velocity.x;
            if (swipePower < -8000) handleNext();
            else if (swipePower > 8000) handlePrev();
          }}
        >
          {userChests.map((chest, idx) => {
            const offset = getRelativeOffset(idx, currentIndex, userChests.length);
            const isCenter = offset === 0;
            const absOffset = Math.abs(offset);
            const isVisible = absOffset <= 2;

            // 让用户在选中的宝箱两边还能看到 2 个缩小宝箱
            const opacity = isCenter ? 1 : absOffset === 1 ? 0.55 : absOffset === 2 ? 0.28 : 0;
            const scale = isCenter ? 1 : absOffset === 1 ? 0.78 : absOffset === 2 ? 0.62 : 0.62;
            const zIndex = isCenter ? 20 : absOffset === 1 ? 10 : absOffset === 2 ? 5 : 0;

            // Cover Flow：左右偏移 + 轻微 3D 视差（rotateY + perspective）
            const step = 85;
            const translateX = `${offset * step}%`;
            const rotateY = offset === 0 ? 0 : Math.max(-55, Math.min(55, -offset * 22));
            const translateZ = isCenter ? 50 : absOffset === 1 ? 10 : 0;

            const ChestIcon = chest.icon;

            return (
              <motion.button
                key={(chest as any).uniqueId || idx}
                type="button"
                onClick={() => {
                  if (isOpening) return;
                  if (idx === currentIndex) return;
                  setCurrentIndex(wrapIndex(idx, userChests.length));
                }}
                className="absolute w-48 h-56 rounded-2xl bg-gradient-to-b from-white/10 to-white/5 backdrop-blur-md flex flex-col items-center justify-center p-6 shadow-xl transform-gpu will-change-transform focus:outline-none"
                style={{
                  zIndex,
                  transformPerspective: 1200,
                  pointerEvents: isVisible ? 'auto' : 'none',
                }}
                initial={false}
                animate={{
                  opacity,
                  scale,
                  x: translateX,
                  rotateY,
                  z: translateZ,
                  transition: spring,
                }}
                whileTap={{ scale: isCenter ? 0.98 : scale }}
              >
                {/* 保留居中选中时的蓝色发光 + 玻璃拟态背景（原有 shadow 逻辑） */}
                <div
                  className={[
                    'absolute inset-0 rounded-2xl pointer-events-none',
                    isCenter ? chest.shadow : '',
                  ].join(' ')}
                />

                <div className={`w-20 h-20 rounded-xl bg-gradient-to-br ${chest.color} flex items-center justify-center mb-4 shadow-inner`}>
                  <ChestIcon className="w-10 h-10 text-white" />
                </div>
                <h3 className="text-xl font-bold text-white mb-1">{chest.name}</h3>
                <p className="text-xs text-gray-300 text-center">{chest.description}</p>
              </motion.button>
            );
          })}
        </motion.div>

        {/* 左右切换按钮 */}
        {userChests.length > 1 && (
          <>
            <button 
              onClick={handlePrev}
              className="absolute left-0 sm:left-4 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center backdrop-blur-sm border border-white/20 text-white hover:bg-white/20 transition-colors z-40"
            >
              &#10094;
            </button>
            <button 
              onClick={handleNext}
              className="absolute right-0 sm:right-4 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center backdrop-blur-sm border border-white/20 text-white hover:bg-white/20 transition-colors z-40"
            >
              &#10095;
            </button>
          </>
        )}
      </div>

      {/* 底部操作区 */}
      <div className="flex flex-col items-center gap-3 z-10 w-full max-w-[280px] shrink-0 mb-4">
        {/* 底部文字：只能淡入淡出，不能跟着滑动 */}
        <div className="relative h-11 w-full flex items-center justify-center">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={currentChest?.id}
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
          disabled={isOpening}
          className={`w-full py-4 rounded-xl font-bold text-lg text-white bg-gradient-to-r ${currentChest?.color || ''} hover:opacity-90 transition-opacity shadow-lg ${currentChest?.shadow || ''} disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {isOpening ? '开启中...' : '开启宝箱'}
        </button>
      </div>
    </div>
  );
}
