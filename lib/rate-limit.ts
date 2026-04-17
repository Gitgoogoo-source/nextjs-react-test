import 'server-only';

import type { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

type AdminClient = ReturnType<typeof createAdminClient>;

export interface RateLimitOptions {
  scope: string;
  route: string;
  limit: number;
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  retryAfterSeconds: number;
}

// 安全：原子检查 + 累加限流计数（通过 Supabase RPC）
export async function checkRateLimit(
  supabase: AdminClient,
  opts: RateLimitOptions
): Promise<RateLimitResult> {
  const { data, error } = await supabase.rpc('check_and_increment_rate_limit', {
    p_scope: opts.scope,
    p_route: opts.route,
    p_limit: opts.limit,
    p_window_seconds: opts.windowSeconds,
  });

  if (error) {
    console.error('[rate-limit] rpc error', error);
    // Fail-open：DB 故障时允许通过，但记录错误，避免服务整体雪崩
    return { allowed: true, remaining: opts.limit, limit: opts.limit, retryAfterSeconds: 0 };
  }

  const payload = data as {
    allowed?: boolean;
    remaining?: number;
    limit?: number;
    retry_after_seconds?: number;
  };

  return {
    allowed: payload?.allowed === true,
    remaining: Math.max(0, Number(payload?.remaining ?? 0)),
    limit: Number(payload?.limit ?? opts.limit),
    retryAfterSeconds: Math.max(0, Number(payload?.retry_after_seconds ?? 0)),
  };
}

// 构造 Telegram 用户的限流 scope（e.g., "tg:123456789"）
export function telegramScope(tgUserId: number | string): string {
  return `tg:${tgUserId}`;
}

// 生成 429 Too Many Requests 响应
export function rateLimitExceededResponse(result: RateLimitResult) {
  return NextResponse.json(
    { error: '请求过于频繁，请稍后再试' },
    {
      status: 429,
      headers: {
        'Retry-After': String(result.retryAfterSeconds || 1),
        'X-RateLimit-Limit': String(result.limit),
        'X-RateLimit-Remaining': String(result.remaining),
      },
    }
  );
}
