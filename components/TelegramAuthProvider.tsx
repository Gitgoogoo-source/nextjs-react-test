'use client';

import { useTelegramAuth } from '@/hooks/useTelegramAuth';
import { ensureTelegramSdk } from '@/lib/telegram-sdk-client';
import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';

export function TelegramAuthProvider({ children }: { children: React.ReactNode }) {
  ensureTelegramSdk();
  const { isSyncing, error } = useTelegramAuth();

  if (isSyncing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="flex flex-col items-center justify-center space-y-4"
        >
          <div className="relative w-24 h-24">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
              className="absolute inset-0 rounded-full border-t-4 border-b-4 border-yellow-500 opacity-50"
            />
            <motion.div
              animate={{ rotate: -360 }}
              transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
              className="absolute inset-2 rounded-full border-l-4 border-r-4 border-blue-500 opacity-75"
            />
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="w-8 h-8 text-foreground animate-spin" />
            </div>
          </div>
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.5 }}
            className="text-lg font-semibold tracking-wider uppercase text-tg-hint"
          >
            正在同步数据...
          </motion.p>
        </motion.div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
        <div className="text-center space-y-4">
          <p className="text-red-500 font-bold text-xl">同步失败</p>
          <p className="text-tg-hint">{error}</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
