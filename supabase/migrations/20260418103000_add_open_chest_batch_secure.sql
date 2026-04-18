-- 新增 open_chest_batch_secure：在单事务内执行 N 次开箱
-- 语义：要么全部成功（扣 price*N 叶子 + N 个宝箱 + 发放 N 件物品），要么整批回滚
-- 幂等：以每个 request_id 单独抢占 chest_open_events，支持客户端用同一批 request_ids 重试
-- 安全：RPC 内锁 users、user_cases 行，避免并发抢扣

CREATE OR REPLACE FUNCTION public.open_chest_batch_secure(
  p_user_id uuid,
  p_chest_id uuid,
  p_price integer,
  p_item_ids uuid[],
  p_request_ids uuid[],
  p_times integer
) RETURNS json AS $$
DECLARE
  v_user_balance integer;
  v_user_stars integer;
  v_case_quantity integer;
  v_pending_count integer;
  v_balance_after integer;
  v_stars_after integer;
  v_case_quantity_after integer;
  v_claimed_id uuid;
  v_historical_item_id uuid;
  v_results jsonb := '[]'::jsonb;
  v_already_processed_count integer := 0;
  v_current_balance integer;
  v_current_case_qty integer;
  i integer;
BEGIN
  -- 1. 参数自检
  IF p_times < 1 OR p_times > 10 THEN
    RAISE EXCEPTION 'Invalid times: must be between 1 and 10';
  END IF;
  IF array_length(p_item_ids, 1) IS NULL OR array_length(p_item_ids, 1) <> p_times THEN
    RAISE EXCEPTION 'Array length mismatch: item_ids';
  END IF;
  IF array_length(p_request_ids, 1) IS NULL OR array_length(p_request_ids, 1) <> p_times THEN
    RAISE EXCEPTION 'Array length mismatch: request_ids';
  END IF;
  IF p_price <= 0 THEN
    RAISE EXCEPTION 'Invalid price';
  END IF;

  -- 2. 统计本批中已被处理过的次数（幂等重试场景）
  SELECT p_times - COUNT(*) INTO v_pending_count
  FROM chest_open_events
  WHERE user_id = p_user_id AND request_id = ANY(p_request_ids);

  -- 3. 锁用户行，取当前余额
  SELECT balance, stars INTO v_user_balance, v_user_stars
  FROM users
  WHERE id = p_user_id
  FOR UPDATE;

  IF v_user_balance IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  v_current_balance := v_user_balance;

  -- 4. 仅当存在未处理的开箱请求时，预检余额与宝箱数量
  IF v_pending_count > 0 THEN
    IF v_user_balance < p_price * v_pending_count THEN
      RAISE EXCEPTION 'Insufficient balance';
    END IF;

    SELECT quantity INTO v_case_quantity
    FROM user_cases
    WHERE user_id = p_user_id AND case_id = p_chest_id
    FOR UPDATE;

    IF v_case_quantity IS NULL OR v_case_quantity < v_pending_count THEN
      RAISE EXCEPTION 'Not enough chests';
    END IF;

    v_current_case_qty := v_case_quantity;
  ELSE
    -- 没有待处理项，也取当前数量用于返回快照
    SELECT COALESCE(quantity, 0) INTO v_current_case_qty
    FROM user_cases
    WHERE user_id = p_user_id AND case_id = p_chest_id;
    v_current_case_qty := COALESCE(v_current_case_qty, 0);
  END IF;

  -- 5. 逐次开箱：每次独立抢占 event，已处理则返回历史结果
  FOR i IN 1..p_times LOOP
    v_claimed_id := NULL;

    INSERT INTO chest_open_events (user_id, case_id, request_id, price, created_at)
    VALUES (p_user_id, p_chest_id, p_request_ids[i], p_price, now())
    ON CONFLICT (user_id, request_id) DO NOTHING
    RETURNING id INTO v_claimed_id;

    IF v_claimed_id IS NULL THEN
      SELECT item_id INTO v_historical_item_id
      FROM chest_open_events
      WHERE user_id = p_user_id AND request_id = p_request_ids[i];

      v_results := v_results || jsonb_build_object(
        'index', i - 1,
        'item_id', v_historical_item_id,
        'already_processed', true
      );
      v_already_processed_count := v_already_processed_count + 1;
      CONTINUE;
    END IF;

    -- 扣除余额 & 宝箱数
    UPDATE users
    SET balance = balance - p_price
    WHERE id = p_user_id;

    UPDATE user_cases
    SET quantity = quantity - 1, updated_at = now()
    WHERE user_id = p_user_id AND case_id = p_chest_id;

    v_current_balance := v_current_balance - p_price;
    v_current_case_qty := v_current_case_qty - 1;

    -- 发放物品（upsert 保证同一物品累加）
    INSERT INTO user_items (user_id, item_id, quantity, created_at, updated_at)
    VALUES (p_user_id, p_item_ids[i], 1, now(), now())
    ON CONFLICT (user_id, item_id)
    DO UPDATE SET quantity = user_items.quantity + 1, updated_at = now();

    -- 事件快照
    UPDATE chest_open_events
    SET
      item_id = p_item_ids[i],
      balance_before = v_current_balance + p_price,
      balance_after = v_current_balance,
      stars_before = v_user_stars,
      stars_after = v_user_stars,
      case_quantity_before = v_current_case_qty + 1,
      case_quantity_after = v_current_case_qty
    WHERE id = v_claimed_id;

    v_results := v_results || jsonb_build_object(
      'index', i - 1,
      'item_id', p_item_ids[i],
      'already_processed', false
    );
  END LOOP;

  -- 6. 最终快照返回
  SELECT balance, stars INTO v_balance_after, v_stars_after
  FROM users
  WHERE id = p_user_id;

  SELECT COALESCE(quantity, 0) INTO v_case_quantity_after
  FROM user_cases
  WHERE user_id = p_user_id AND case_id = p_chest_id;

  RETURN json_build_object(
    'success', true,
    'items', v_results,
    'already_processed_count', v_already_processed_count,
    'assets', json_build_object('balance', v_balance_after, 'stars', v_stars_after),
    'case_quantity_after', v_case_quantity_after
  );
END;
$$ LANGUAGE plpgsql;

-- =============== 限流 RPC 增加 p_delta 默认 1（向后兼容） ===============
DROP FUNCTION IF EXISTS public.check_and_increment_rate_limit(text, text, integer, integer);

CREATE OR REPLACE FUNCTION public.check_and_increment_rate_limit(
  p_scope text,
  p_route text,
  p_limit integer,
  p_window_seconds integer,
  p_delta integer DEFAULT 1
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
  IF p_delta <= 0 THEN
    RAISE EXCEPTION 'rate_limit: invalid delta';
  END IF;

  v_window_start := to_timestamp(
    (floor(extract(epoch FROM v_now) / p_window_seconds) * p_window_seconds)::bigint
  );
  v_reset_at := v_window_start + make_interval(secs => p_window_seconds);

  INSERT INTO public.api_rate_limits AS r (scope, route, window_start, count, updated_at)
  VALUES (p_scope, p_route, v_window_start, p_delta, v_now)
  ON CONFLICT (scope, route, window_start)
  DO UPDATE SET
    count = r.count + p_delta,
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
