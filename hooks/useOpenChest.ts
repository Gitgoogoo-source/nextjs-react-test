'use client';

import { useState, useRef } from 'react';
import { useMotionValue, useMotionValueEvent } from 'framer-motion';
import confetti from 'canvas-confetti';
import { telegramHapticImpact, telegramHapticNotify } from '@/lib/telegram-haptics';
import { useUserStore } from '@/store/useUserStore';
import { useChestStore } from '@/store/useChestStore';
import { useCollectionStore } from '@/store/useCollectionStore';
import type { ChestListItem } from '@/store/useChestStore';
import React from 'react';
import { Package, Sparkles, Crown } from 'lucide-react';

export type PrizeViewItem = {
  id?: string;
  name: string;
  color: string;
  border: string;
  rarity: string;
  hex: string;
};

// CSGO 风格稀有度展示配置（仅前端轮盘填充用，真实掉率来自数据库）
export const MOCK_PRIZES: PrizeViewItem[] = [
  { name: '军规级鸭子', color: 'bg-blue-500/20', border: 'border-blue-400/50', rarity: 'Mil-Spec', hex: '#3b82f6' },
  { name: '受限级鸭子', color: 'bg-purple-500/20', border: 'border-purple-400/50', rarity: 'Restricted', hex: '#a855f7' },
  { name: '保密级鸭子', color: 'bg-pink-500/20', border: 'border-pink-400/50', rarity: 'Classified', hex: '#ec4899' },
  { name: '隐秘级鸭子', color: 'bg-red-500/20', border: 'border-red-400/50', rarity: 'Covert', hex: '#ef4444' },
  { name: '罕见级鸭子', color: 'bg-yellow-500/20', border: 'border-yellow-400/50', rarity: 'Rare Special', hex: '#eab308' },
];

export const CHEST_ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  normal: Package,
  rare: Sparkles,
  exclusive: Crown,
  legend: Crown,
};

export interface UserChestInstance extends ChestListItem {
  uniqueId: string;
  icon: React.ComponentType<{ className?: string }>;
}

// 稀有度排序权重（越高越稀有，优先展示）
const RARITY_WEIGHT: Record<string, number> = {
  'Rare Special': 5,
  'Covert': 4,
  'Classified': 3,
  'Restricted': 2,
  'Mil-Spec': 1,
};

function rarityWeight(rarity: string) {
  return RARITY_WEIGHT[rarity] ?? 0;
}

/** 找出稀有度最高的物品（轮盘焦点与撒花依据） */
export function findHighestRarityItem(items: PrizeViewItem[]): PrizeViewItem | null {
  if (items.length === 0) return null;
  return items.reduce((best, cur) =>
    rarityWeight(cur.rarity) > rarityWeight(best.rarity) ? cur : best
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

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  const c = crypto as unknown as Crypto | undefined;
  if (!c || typeof c.getRandomValues !== 'function') throw new Error('浏览器不支持安全随机数生成');
  const bytes = new Uint8Array(16);
  c.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function buildRouletteItems(winner: PrizeViewItem, fast = false): PrizeViewItem[] {
  const count = fast ? 30 : 50;
  const targetIdx = fast ? 24 : 44;
  return Array.from({ length: count }, (_, i) => {
    if (i === targetIdx) return winner;
    const rand = Math.random() * 100;
    if (rand < 50) return MOCK_PRIZES[0];
    if (rand < 75) return MOCK_PRIZES[1];
    if (rand < 90) return MOCK_PRIZES[2];
    if (rand < 98) return MOCK_PRIZES[3];
    return MOCK_PRIZES[4];
  });
}

export const SINGLE_ROULETTE_TARGET_IDX = 44;
export const BATCH_ROULETTE_TARGET_IDX = 24;

export type OpenMode = 'single' | 'batch';

/** 十连：每条独立轮盘序列与终点位移（与单抽同宽 100px/格） */
export type BatchRouletteStrip = { items: PrizeViewItem[]; targetX: number };

export function useOpenChest(currentChest: UserChestInstance | null) {
  const initData = useUserStore((s) => s.initData);
  const setAssetsFromServer = useUserStore((s) => s.setAssetsFromServer);

  const [isOpening, setIsOpening] = useState(false);
  const [isOpeningPending, setIsOpeningPending] = useState(false);
  const [openMode, setOpenMode] = useState<OpenMode>('single');
  const [rouletteItems, setRouletteItems] = useState<PrizeViewItem[]>([]);
  const [isSpinning, setIsSpinning] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [wonItem, setWonItem] = useState<PrizeViewItem | null>(null);
  const [wonItems, setWonItems] = useState<PrizeViewItem[]>([]);
  const [targetX, setTargetX] = useState(0);
  const [batchRouletteStrips, setBatchRouletteStrips] = useState<BatchRouletteStrip[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const lastTickIndex = useRef(-1);
  const isSpinningRef = useRef(false);
  isSpinningRef.current = isSpinning;
  const openModeRef = useRef(openMode);
  openModeRef.current = openMode;
  // 保存本批 requestIds，重试时复用以保证幂等
  const batchRequestIdsRef = useRef<string[] | null>(null);

  useMotionValueEvent(x, 'change', (latest) => {
    // 十连时每条轮盘自带 tick，此处仅单开
    if (!isSpinningRef.current || openModeRef.current !== 'single') return;
    const idx = Math.floor(Math.abs(latest) / 100);
    if (idx !== lastTickIndex.current) {
      lastTickIndex.current = idx;
      playTickSound();
      triggerHaptic();
    }
  });

  const resetState = () => {
    setIsOpening(false);
    setIsOpeningPending(false);
    setShowResult(false);
    setIsSpinning(false);
    setRouletteItems([]);
    setBatchRouletteStrips([]);
    setWonItems([]);
    setActionError(null);
    x.set(0);
    lastTickIndex.current = -1;
    batchRequestIdsRef.current = null;
  };

  const handleSpinComplete = () => {
    setShowResult(true);
    try { telegramHapticNotify('success'); } catch (e) { console.error('Haptic notify failed', e); }
    const highlight = openMode === 'batch' ? findHighestRarityItem(wonItems) : wonItem;
    if (!highlight) return;
    // 仅稀有物品触发撒花，避免普通物品 10 次叠加掉帧
    const isRare = ['Classified', 'Covert', 'Rare Special'].includes(highlight.rarity);
    if (!isRare && openMode === 'batch') return;
    const end = Date.now() + 3000;
    const frame = () => {
      confetti({ particleCount: 5, angle: 60, spread: 55, origin: { x: 0, y: 0.8 }, colors: [highlight.hex, '#ffffff'] });
      confetti({ particleCount: 5, angle: 120, spread: 55, origin: { x: 1, y: 0.8 }, colors: [highlight.hex, '#ffffff'] });
      if (Date.now() < end) requestAnimationFrame(frame);
    };
    confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 }, colors: [highlight.hex, '#ffffff', '#facc15'] });
    frame();
  };

  const startOpen = async (mode: OpenMode = 'single') => {
    if (isOpening || isOpeningPending || !currentChest) return;
    setActionError(null);
    if (!initData) {
      setActionError('未获取到登录信息，请在 Telegram 内重新打开小游戏');
      try { telegramHapticNotify('error'); } catch (e) { console.error('Haptic notify failed', e); }
      return;
    }

    setOpenMode(mode);
    setIsOpeningPending(true);
    setShowResult(false);
    setIsSpinning(false);
    x.set(0);
    lastTickIndex.current = -1;

    try {
      if (mode === 'single') {
        const requestId = generateUUID();
        const response = await fetch('/api/chest/open', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chestId: currentChest.case_id, requestId, initData }),
        });

        let body: {
          success?: boolean;
          error?: string;
          data?: { wonItem: PrizeViewItem; randomOffset: number; userAssets?: { balance: number; stars: number } };
        };
        try {
          body = (await response.json()) as typeof body;
        } catch {
          throw new Error('服务器响应无效，请稍后重试');
        }

        if (!response.ok || !body.success || !body.data) throw new Error(body.error || '开启宝箱失败');

        const { wonItem: serverWonItem, randomOffset, userAssets } = body.data;
        if (userAssets) setAssetsFromServer(userAssets);

        void useChestStore.getState().refreshSilent(initData);
        void useCollectionStore.getState().refreshSilent(initData);
        void useUserStore.getState().syncSilent(initData);

        const items = buildRouletteItems(serverWonItem, false);
        setRouletteItems(items);
        setBatchRouletteStrips([]);
        setWonItem(items[SINGLE_ROULETTE_TARGET_IDX]);
        setWonItems([]);

        setIsOpeningPending(false);
        setIsOpening(true);

        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setTargetX(-(SINGLE_ROULETTE_TARGET_IDX * 100 + 50) + randomOffset);
            setIsSpinning(true);
          });
        });
      } else {
        // 批量开箱：复用已有的 requestIds（重试幂等）
        if (!batchRequestIdsRef.current) {
          batchRequestIdsRef.current = Array.from({ length: 10 }, () => generateUUID());
        }
        const requestIds = batchRequestIdsRef.current;

        const response = await fetch('/api/chest/open-batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chestId: currentChest.case_id, requestIds, initData }),
        });

        let body: {
          success?: boolean;
          error?: string;
          data?: {
            wonItems: PrizeViewItem[];
            randomOffset: number;
            userAssets?: { balance: number; stars: number };
          };
        };
        try {
          body = (await response.json()) as typeof body;
        } catch {
          throw new Error('服务器响应无效，请稍后重试');
        }

        if (!response.ok || !body.success || !body.data) throw new Error(body.error || '十连开箱失败');

        const { wonItems: serverWonItems, randomOffset, userAssets } = body.data;
        if (userAssets) setAssetsFromServer(userAssets);

        // 成功后清空 requestIds，允许下次生成新的
        batchRequestIdsRef.current = null;

        void useChestStore.getState().refreshSilent(initData);
        void useCollectionStore.getState().refreshSilent(initData);
        void useUserStore.getState().syncSilent(initData);

        // 十连：10 条独立轮盘，每条以对应奖品为终点
        const strips: BatchRouletteStrip[] = serverWonItems.map((wonItem, i) => {
          const items = buildRouletteItems(wonItem, true);
          const offset = ((randomOffset + i * 17) % 60) - 30;
          const tx = -(BATCH_ROULETTE_TARGET_IDX * 100 + 50) + offset;
          return { items, targetX: tx };
        });
        setRouletteItems([]);
        setBatchRouletteStrips(strips);
        setWonItem(null);
        setWonItems(serverWonItems);

        setIsOpeningPending(false);
        setIsOpening(true);

        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setIsSpinning(true);
          });
        });
      }
    } catch (error: unknown) {
      console.error('Error:', error);
      setIsOpening(false);
      setIsOpeningPending(false);
      const message = error instanceof Error ? error.message : '开启宝箱失败，请重试';
      setActionError(message);
      try { telegramHapticNotify('error'); } catch (e) { console.error('Haptic notify failed', e); }
    }
  };

  return {
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
  };
}
