'use client';

import React, { useState, useEffect } from 'react';
import { 
  TrendingUp, 
  Archive, 
  Package, 
  User, 
  CheckSquare,
  Wallet,
  Flame,
  Star,
  Leaf
} from 'lucide-react';
import { postEvent } from '@telegram-apps/sdk-react';
import Image from 'next/image';

import ChestView from './ChestView';
import CollectionView from './CollectionView';
import FriendsView from './FriendsView';
import { useTelegramAuth } from '@/hooks/useTelegramAuth';
import { useUserStore } from '@/store/useUserStore'; // 引入 Store

export default function AppLayout() {
  const [activeTab, setActiveTab] = useState('ducks');
  const { user } = useTelegramAuth();
  
  // 从 Zustand 获取实时资产数据
  const { balance, stars } = useUserStore();

  useEffect(() => {
    try {
      // 1. 展开小程序，占据全屏
      postEvent('web_app_expand');
      // 2. 禁用 Telegram 的垂直滑动关闭特性 (防止滑动宝箱时误触关闭)
      postEvent('web_app_setup_swipe_behavior', { allow_vertical_swipe: false });
    } catch {
      // 在非 Telegram 环境下（如本地浏览器预览）忽略报错
      console.warn('Not in Telegram environment');
    }
  }, []);

  const tabs = [
    { id: 'market', label: '市场', icon: TrendingUp },
    { id: 'eggs', label: '藏品', icon: Archive, badge: 207 },
    { id: 'ducks', label: '宝箱', icon: Package },
    { id: 'friends', label: '好友', icon: User },
    { id: 'tasks', label: '任务', icon: CheckSquare, badge: 3 },
  ];

  return (
    <div className="flex flex-col h-screen w-full max-w-md mx-auto bg-background text-foreground font-sans relative overflow-hidden">
      {/* 顶部导航栏 */}
      <div className="flex items-center justify-between px-4 py-4 z-10">
        {/* 左侧：用户信息 */}
        <div className="flex items-center gap-2">
          {/* 头像 */}
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-teal-400 to-blue-500 flex items-center justify-center border-2 border-purple-500/30 shadow-[0_0_10px_rgba(168,85,247,0.2)] overflow-hidden">
            {user?.photo_url ? (
              <Image
                src={user.photo_url}
                alt="avatar"
                width={40}
                height={40}
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-app-body font-bold text-foreground">
                {user?.first_name?.charAt(0) || 'K'}
              </span>
            )}
          </div>
          
          {/* 鸭群 */}
          <div className="flex items-center gap-1.5 bg-foreground/5 rounded-full px-3 py-1.5 border border-foreground/10">
            <Flame className="w-4 h-4 text-tg-hint" />
            <span className="text-app-body font-medium text-foreground">鸭群</span>
          </div>
          
          {/* 钱包 */}
          <button className="w-9 h-9 rounded-full bg-foreground/5 flex items-center justify-center border border-foreground/10 transition-colors hover:bg-foreground/10">
            <Wallet className="w-4 h-4 text-tg-hint" />
          </button>
        </div>

        {/* 右侧：资源信息 - 已修正为实时数据 */}
        <div className="flex items-center gap-2 text-app-heading font-bold tracking-tight">
          <span>{balance.toLocaleString()}</span>
          <div className="flex items-center gap-1">
            <Leaf className="w-5 h-5 text-green-400 fill-green-400" />
            <span>{stars.toLocaleString()}</span>
          </div>
          <Star className="w-5 h-5 text-purple-400 fill-purple-400 ml-1 drop-shadow-[0_0_8px_rgba(168,85,247,0.5)]" />
        </div>
      </div>

      {/* 主内容区域：相对顶栏与底栏之间的剩余高度；纵向滚动，隐藏滚动条避免右侧/底部滚动条 UI */}
      <div
        className={[
          'relative flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overflow-x-hidden overscroll-y-contain',
          '[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:h-0 [&::-webkit-scrollbar]:w-0',
        ].join(' ')}
      >
        {activeTab === 'ducks' ? (
          <ChestView />
        ) : activeTab === 'eggs' ? (
          <CollectionView />
        ) : activeTab === 'friends' ? (
          <FriendsView />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-app-body font-medium text-tg-hint">
            {tabs.find(t => t.id === activeTab)?.label} 界面内容区域
          </div>
        )}
      </div>

      {/* 底部浮动导航：圆角胶囊 + 半透明底 + 细透明边 + 毛玻璃 */}
      <div className="shrink-0 px-2.5 pt-0.5 pb-[calc(var(--tg-safe-area-inset-bottom,env(safe-area-inset-bottom,0px))+8px)]">
        <nav
          className={[
            'mx-auto flex max-w-full items-stretch justify-around gap-0.5 rounded-full px-1 py-1',
            'border border-foreground/18 bg-foreground/[0.07] shadow-[0_10px_40px_rgba(0,0,0,0.35)]',
            'backdrop-blur-xl backdrop-saturate-150',
            '[box-shadow:inset_0_1px_0_rgba(255,255,255,0.06)]',
          ].join(' ')}
          aria-label="主导航"
        >
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={[
                  'relative flex min-w-0 flex-1 flex-col items-center justify-center rounded-full py-1 transition-all duration-200',
                  isActive ? 'text-foreground' : 'text-tg-hint hover:text-foreground/85',
                ].join(' ')}
              >
                {isActive && (
                  <div
                    className="absolute inset-x-1 inset-y-0.5 rounded-full bg-foreground/[0.09] ring-1 ring-foreground/10"
                    aria-hidden
                  />
                )}

                <div className="relative z-[1] flex flex-col items-center gap-0.5">
                  <div className="relative">
                    <Icon
                      className={[
                        'h-5 w-5 transition-colors',
                        isActive ? 'text-foreground' : 'text-tg-hint',
                      ].join(' ')}
                    />
                    {isActive && (
                      <span
                        className="absolute -bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.65)]"
                        aria-hidden
                      />
                    )}
                    {tab.badge ? (
                      <div className="absolute -top-1.5 -right-3 min-w-[16px] rounded-full border-[1.5px] border-foreground/25 bg-red-500 px-1.5 py-0.5 text-center text-app-caption font-bold text-white shadow-sm">
                        {tab.badge > 99 ? '99+' : tab.badge}
                      </div>
                    ) : null}
                  </div>

                  <span
                    className={[
                      'text-app-caption font-medium transition-colors',
                      isActive ? 'text-foreground' : 'text-tg-hint',
                    ].join(' ')}
                  >
                    {tab.label}
                  </span>
                </div>
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
