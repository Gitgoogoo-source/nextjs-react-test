-- API 层限流（防止刷接口耗尽数据库/Telegram Bot API 配额）
-- 粒度：按 (scope, route) 切分窗口，scope 典型取 "tg:<telegram_id>" 或 "ip:<ip>"

-- ========== 1) 限流计数表 ==========
-- 说明：按时间窗口对齐（window_start）分桶计数；旧桶依靠定期清理或自然衰减
CREATE TABLE IF NOT EXISTS public.api_rate_limits (
  scope text NOT NULL,
  route text NOT NULL,
  window_start timestamptz NOT NULL,
  count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (scope, route, window_start)
);

CREATE INDEX IF NOT EXISTS api_rate_limits_updated_at_idx
  ON public.api_rate_limits (updated_at);

-- ========== 2) 原子累加 + 判定 RPC ==========
-- 说明：
-- - INSERT ... ON CONFLICT DO UPDATE 在单个语句内原子完成读-改-写
-- - 即使同一 scope+route 并发命中，Postgres 也会串行化为正确的计数
-- - allowed 为 true 当且仅当本次增加后 count <= p_limit（最后一次允许的请求也会通过）
CREATE OR REPLACE FUNCTION public.check_and_increment_rate_limit(
  p_scope text,
  p_route text,
  p_limit integer,
  p_window_seconds integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
  v_window_start timestamptz;
  v_reset_at timestamptz;
  v_count integer;
BEGIN
  IF p_limit <= 0 OR p_window_seconds <= 0 THEN
    RAISE EXCEPTION 'rate_limit: invalid limit/window';
  END IF;

  -- 对齐到窗口起点（整秒切片）
  v_window_start := to_timestamp(
    (floor(extract(epoch FROM v_now) / p_window_seconds) * p_window_seconds)::bigint
  );
  v_reset_at := v_window_start + make_interval(secs => p_window_seconds);

  INSERT INTO public.api_rate_limits AS r (scope, route, window_start, count, updated_at)
  VALUES (p_scope, p_route, v_window_start, 1, v_now)
  ON CONFLICT (scope, route, window_start)
  DO UPDATE SET
    count = r.count + 1,
    updated_at = v_now
  RETURNING count INTO v_count;

  RETURN jsonb_build_object(
    'allowed', v_count <= p_limit,
    'count', v_count,
    'limit', p_limit,
    'remaining', GREATEST(p_limit - v_count, 0),
    'reset_at', v_reset_at,
    'retry_after_seconds', GREATEST(ceil(extract(epoch FROM (v_reset_at - v_now)))::int, 0)
  );
END;
$$;

-- ========== 3) 清理过期窗口（保留 1 天用于观测/排障） ==========
CREATE OR REPLACE FUNCTION public.cleanup_expired_rate_limits()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.api_rate_limits
  WHERE updated_at < now() - interval '1 day';
$$;

-- ========== 4) RLS：service role 绕过，默认拒绝匿名/authenticated 直连 ==========
ALTER TABLE public.api_rate_limits ENABLE ROW LEVEL SECURITY;
