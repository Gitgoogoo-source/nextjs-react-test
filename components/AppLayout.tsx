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

      {/* 底部导航栏 */}
      <div className="bg-tg-secondary-bg border-t border-foreground/5 px-2 py-3 pb-safe">
        <div className="flex justify-around items-center">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative flex flex-col items-center justify-center w-16 h-14 rounded-2xl transition-all duration-200 ${
                  isActive ? 'text-foreground' : 'text-tg-hint hover:text-foreground/80'
                }`}
              >
                {/* 选中状态的背景高亮 */}
                {isActive && (
                  <div className="absolute inset-0 bg-foreground/5 rounded-xl" />
                )}
                
                <div className="relative mb-1">
                  <Icon 
                    className={`w-6 h-6 transition-colors ${
                      isActive ? 'text-foreground' : 'text-tg-hint'
                    }`} 
                  />
                  
                  {/* 徽章 */}
                  {tab.badge && (
                    <div className="absolute -top-2 -right-3 bg-red-500 px-1.5 py-0.5 text-center text-app-caption font-bold text-white min-w-[18px] rounded-full border-[1.5px] border-tg-secondary-bg shadow-sm">
                      {tab.badge > 99 ? '99+' : tab.badge}
                    </div>
                  )}
                </div>
                
                <span
                  className={`text-app-caption font-medium transition-colors ${
                    isActive ? 'text-foreground' : 'text-tg-hint'
                  }`}
                >
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
