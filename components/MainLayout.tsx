'use client';

import React, { useState } from 'react';
import { 
  LineChart, 
  Archive, 
  Package, 
  Users, 
  CheckSquare,
  Wallet,
  Flame,
  Star,
  Leaf
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useUserStore } from '@/store/useUserStore';
import ChestView from './ChestView';

export default function MainLayout() {
  const [activeTab, setActiveTab] = useState('ducks');
  const { balance, stars } = useUserStore();

  const tabs = [
    { id: 'market', label: '市场', icon: LineChart },
    { id: 'eggs', label: '藏品', icon: Archive, badge: 207 },
    { id: 'ducks', label: '宝箱', icon: Package },
    { id: 'friends', label: '好友', icon: Users },
    { id: 'tasks', label: '任务', icon: CheckSquare, badge: 3 },
  ];

  return (
    <div className="flex flex-col h-screen bg-background text-foreground font-sans overflow-hidden">
      {/* 顶部导航栏 */}
      <div className="flex items-center justify-between px-4 py-3 bg-background/80 backdrop-blur-sm z-10">
        {/* 左侧：用户信息 */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-teal-400 to-blue-500 flex items-center justify-center border-2 border-purple-500/30">
              <span className="text-lg font-bold">K</span>
            </div>
          </div>
          
          <div className="flex items-center gap-2 bg-foreground/5 rounded-full px-3 py-1.5 border border-foreground/10">
            <Flame className="w-4 h-4 text-tg-hint" />
            <span className="text-sm font-medium text-foreground">鸭群</span>
          </div>
          
          <div className="w-8 h-8 rounded-full bg-foreground/5 flex items-center justify-center border border-foreground/10">
            <Wallet className="w-4 h-4 text-tg-hint" />
          </div>
        </div>

        {/* 右侧：资源信息 (带动画) */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 font-bold text-xl">
            <AnimatePresence mode="wait">
              <motion.span
                key={balance}
                initial={{ y: 5, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="tabular-nums"
              >
                {balance.toLocaleString()}
              </motion.span>
            </AnimatePresence>
            <Leaf className="w-5 h-5 text-green-400 fill-green-400" />
            
            <AnimatePresence mode="wait">
              <motion.span
                key={stars}
                initial={{ y: 5, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="tabular-nums ml-1"
              >
                {stars.toLocaleString()}
              </motion.span>
            </AnimatePresence>
            <Star className="w-5 h-5 text-blue-400 fill-blue-400" />
          </div>
        </div>
      </div>

      {/* 主内容区域 */}
      <div className="flex-1 overflow-y-auto relative">
        {activeTab === 'ducks' ? (
          <ChestView />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-tg-hint">
            {tabs.find(t => t.id === activeTab)?.label} 界面内容区域
          </div>
        )}
      </div>

      {/* 底部导航栏 */}
      <div className="bg-tg-secondary-bg border-t border-foreground/5 px-2 py-2 pb-safe">
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
                  <Icon className={`w-6 h-6 ${isActive ? 'text-foreground' : 'text-tg-hint'}`} />
                  
                  {/* 徽章 */}
                  {tab.badge && (
                    <div className="absolute -top-1.5 -right-2.5 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[16px] text-center border border-tg-secondary-bg">
                      {tab.badge > 99 ? '99+' : tab.badge}
                    </div>
                  )}
                </div>
                
                <span className={`text-[10px] font-medium ${isActive ? 'text-foreground' : 'text-tg-hint'}`}>
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
