'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Copy, Gift, Link2, RefreshCcw, Users } from 'lucide-react';
import { openTelegramLink, shareMessage } from '@telegram-apps/sdk-react';
import { useUserStore } from '@/store/useUserStore';
import { useTelegramAuth } from '@/hooks/useTelegramAuth';

type FriendsSummary = {
  invitedCount: number;
  rewardTotal: number;
};

function openTelegramShare(shareUrl: string) {
  try {
    if (openTelegramLink.isAvailable()) {
      openTelegramLink(shareUrl);
      return;
    }
  } catch {
    // ignore
  }

  window.open(shareUrl, '_blank', 'noopener,noreferrer');
}

export default function FriendsView() {
  const { initData } = useUserStore();
  const { user } = useTelegramAuth();

  const [summary, setSummary] = useState<FriendsSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME;
  const [preparedMsgId, setPreparedMsgId] = useState<string | null>(null);

  const inviteLink = useMemo(() => {
    if (!botUsername || !user?.id) return '';
    const startParam = `ref_${user.id}`; // 不放敏感信息：仅用于归因
    return `https://t.me/${botUsername}?startapp=${encodeURIComponent(startParam)}`;
  }, [botUsername, user?.id]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 1800);
  }, []);

  const fetchSummary = useCallback(async () => {
    if (!initData) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/friends/summary', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ initData }),
        cache: 'no-store',
      });
      const json = (await res.json()) as {
        success?: boolean;
        data?: FriendsSummary;
        error?: string;
      };
      if (!res.ok || !json.success || !json.data) {
        throw new Error(json.error || '请求失败');
      }

      setSummary({
        invitedCount: Number(json.data.invitedCount || 0),
        rewardTotal: Number(json.data.rewardTotal || 0),
      });
    } catch (e) {
      const msg = typeof e === 'object' && e !== null && 'message' in e ? String((e as { message?: unknown }).message) : '加载失败';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [initData]);

  useEffect(() => {
    if (!initData) return;
    fetchSummary();
  }, [initData, fetchSummary]);

  const onShare = useCallback(async () => {
    if (!inviteLink) {
      showToast('未配置邀请链接');
      return;
    }

    // 组合方式（优先 2 再回退 1）：
    // 2) 服务端调用 Bot API savePreparedInlineMessage 生成 msg_id 后走 shareMessage（体验最好）
    // 1) 兜底走 startapp 深链接 + share/url 分享面板（归因最稳定）
    if (initData && shareMessage.isAvailable()) {
      try {
        // 若本地已有缓存，直接走 shareMessage
        if (preparedMsgId) {
          await shareMessage(preparedMsgId);
          return;
        }

        const res = await fetch('/api/friends/prepared-message', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ initData }),
          cache: 'no-store',
        });
        const json = (await res.json()) as {
          success?: boolean;
          data?: { msgId?: string };
          error?: string;
        };
        if (res.ok && json.success && json.data && typeof json.data.msgId === 'string') {
          const msgId = json.data.msgId;
          setPreparedMsgId(msgId);
          await shareMessage(msgId);
          return;
        }
      } catch {
        // ignore and fallback
      }
    }

    const shareText = '来一起玩吧！点击链接进入并领取新手奖励：';
    const tgShareUrl = `https://t.me/share/url?url=${encodeURIComponent(inviteLink)}&text=${encodeURIComponent(shareText)}`;
    openTelegramShare(tgShareUrl);
  }, [initData, inviteLink, preparedMsgId, showToast]);

  const onCopy = useCallback(async () => {
    if (!inviteLink) {
      showToast('未配置邀请链接');
      return;
    }
    try {
      await navigator.clipboard.writeText(inviteLink);
      showToast('已复制邀请链接');
    } catch {
      showToast('复制失败，请手动复制');
    }
  }, [inviteLink, showToast]);

  return (
    <div className="p-4 pb-24">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-white/80" />
          <h2 className="text-lg font-semibold">好友邀请</h2>
        </div>
        <button
          onClick={fetchSummary}
          className="flex items-center gap-2 text-xs text-white/70 hover:text-white transition"
          disabled={!initData || loading}
        >
          <RefreshCcw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          刷新
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="flex items-center gap-2 text-white/70 text-xs">
            <Users className="w-4 h-4" />
            已邀请
          </div>
          <div className="mt-2 text-2xl font-bold tabular-nums">
            {summary ? summary.invitedCount.toLocaleString() : loading ? '…' : '0'}
          </div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="flex items-center gap-2 text-white/70 text-xs">
            <Gift className="w-4 h-4" />
            奖励总额
          </div>
          <div className="mt-2 text-2xl font-bold tabular-nums">
            {summary ? summary.rewardTotal.toLocaleString() : loading ? '…' : '0'}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/5 to-transparent p-4">
        <div className="text-sm font-medium mb-2">邀请好友一起玩</div>
        <div className="text-xs text-white/60 mb-4">
          你的好友通过链接进入小程序后，我们会根据 <span className="text-white/80">startapp 参数</span> 进行邀请归因。
        </div>

        <div className="flex gap-2">
          <button
            onClick={onShare}
            className="flex-1 rounded-xl bg-white text-black font-semibold py-3 text-sm flex items-center justify-center gap-2 hover:bg-white/90 transition"
          >
            <Link2 className="w-4 h-4" />
            分享邀请
          </button>
          <button
            onClick={onCopy}
            className="w-12 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 transition flex items-center justify-center"
            aria-label="复制邀请链接"
          >
            <Copy className="w-4 h-4 text-white/80" />
          </button>
        </div>

        {!botUsername && (
          <div className="mt-3 text-xs text-amber-300/90">
            提示：请在环境变量中配置 <span className="font-mono">NEXT_PUBLIC_TELEGRAM_BOT_USERNAME</span>，否则无法生成邀请链接。
          </div>
        )}

        <div className="mt-2 text-[11px] text-white/45">
          分享面板优先走 Telegram 原生 <span className="font-mono">shareMessage</span>（服务端生成并缓存 msg_id），失败时自动回退到链接分享。
        </div>

        {error && <div className="mt-3 text-xs text-red-400">加载失败：{error}</div>}
      </div>

      {toast && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          className="fixed bottom-24 left-1/2 -translate-x-1/2 rounded-full bg-black/80 px-4 py-2 text-xs text-white border border-white/10 backdrop-blur"
        >
          {toast}
        </motion.div>
      )}
    </div>
  );
}

