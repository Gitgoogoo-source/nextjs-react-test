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

function buildRouletteItems(winner: PrizeViewItem): PrizeViewItem[] {
  return Array.from({ length: 50 }, (_, i) => {
    if (i === 44) return winner;
    const rand = Math.random() * 100;
    if (rand < 50) return MOCK_PRIZES[0];
    if (rand < 75) return MOCK_PRIZES[1];
    if (rand < 90) return MOCK_PRIZES[2];
    if (rand < 98) return MOCK_PRIZES[3];
    return MOCK_PRIZES[4];
  });
}

export function useOpenChest(currentChest: UserChestInstance | null) {
  const initData = useUserStore((s) => s.initData);
  const setAssetsFromServer = useUserStore((s) => s.setAssetsFromServer);

  const [isOpening, setIsOpening] = useState(false);
  const [rouletteItems, setRouletteItems] = useState<PrizeViewItem[]>([]);
  const [isSpinning, setIsSpinning] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [wonItem, setWonItem] = useState<PrizeViewItem | null>(null);
  const [targetX, setTargetX] = useState(0);
  const [actionError, setActionError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const lastTickIndex = useRef(-1);

  useMotionValueEvent(x, 'change', (latest) => {
    if (!isSpinning) return;
    const idx = Math.floor(Math.abs(latest) / 100);
    if (idx !== lastTickIndex.current) {
      lastTickIndex.current = idx;
      playTickSound();
      triggerHaptic();
    }
  });

  const resetState = () => {
    setIsOpening(false);
    setShowResult(false);
    setIsSpinning(false);
    setRouletteItems([]);
    setActionError(null);
    x.set(0);
    lastTickIndex.current = -1;
  };

  const handleSpinComplete = () => {
    setShowResult(true);
    try { telegramHapticNotify('success'); } catch (e) { console.error('Haptic notify failed', e); }
    if (!wonItem) return;
    const end = Date.now() + 3000;
    const frame = () => {
      confetti({ particleCount: 5, angle: 60, spread: 55, origin: { x: 0, y: 0.8 }, colors: [wonItem.hex, '#ffffff'] });
      confetti({ particleCount: 5, angle: 120, spread: 55, origin: { x: 1, y: 0.8 }, colors: [wonItem.hex, '#ffffff'] });
      if (Date.now() < end) requestAnimationFrame(frame);
    };
    confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 }, colors: [wonItem.hex, '#ffffff', '#facc15'] });
    frame();
  };

  const startOpen = async () => {
    if (isOpening || !currentChest) return;
    setActionError(null);
    if (!initData) {
      setActionError('未获取到登录信息，请在 Telegram 内重新打开小游戏');
      try { telegramHapticNotify('error'); } catch (e) { console.error('Haptic notify failed', e); }
      return;
    }

    setIsOpening(true);
    setShowResult(false);
    setIsSpinning(false);
    x.set(0);
    lastTickIndex.current = -1;

    try {
      const requestId = generateUUID();
      const response = await fetch('/api/chest/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chestId: currentChest.case_id, requestId, initData }),
      });

      const body = (await response.json()) as {
        success?: boolean;
        error?: string;
        data?: { wonItem: PrizeViewItem; randomOffset: number; userAssets?: { balance: number; stars: number } };
      };

      if (!response.ok || !body.success || !body.data) throw new Error(body.error || '开启宝箱失败');

      const { wonItem: serverWonItem, randomOffset, userAssets } = body.data;
      if (userAssets) setAssetsFromServer(userAssets);

      void useChestStore.getState().refreshSilent(initData);
      void useCollectionStore.getState().refreshSilent(initData);
      void useUserStore.getState().syncSilent(initData);

      const items = buildRouletteItems(serverWonItem);
      setRouletteItems(items);
      setWonItem(items[44]);

      setTimeout(() => {
        if (containerRef.current) {
          setTargetX(-(44 * 100 + 50) + randomOffset);
          setIsSpinning(true);
        }
      }, 100);
    } catch (error: unknown) {
      console.error('Error:', error);
      setIsOpening(false);
      const message = error instanceof Error ? error.message : '开启宝箱失败，请重试';
      setActionError(message);
      try { telegramHapticNotify('error'); } catch (e) { console.error('Haptic notify failed', e); }
    }
  };

  return {
    isOpening, isSpinning, showResult, wonItem,
    rouletteItems, targetX, x, containerRef,
    actionError,
    startOpen, resetState, handleSpinComplete,
  };
}
