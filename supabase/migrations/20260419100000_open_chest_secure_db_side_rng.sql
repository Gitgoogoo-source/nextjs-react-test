-- 把抽奖逻辑从 Node 层下沉到 DB 层
-- 变更：
--   open_chest_secure：删除 p_item_id 参数，由 RPC 内部从 case_items 加权随机抽取
--   open_chest_batch_secure：删除 p_item_ids 参数，每次开箱在 RPC 内独立抽取
-- 安全收益：
--   任何绕过 API 层直接调 RPC 的调用都无法伪造中奖物品
--   case_items 上下架（drop_chance=0）自动生效，无需同步 Node 代码

-- 1. 删除旧签名
DROP FUNCTION IF EXISTS public.open_chest_secure(uuid, uuid, integer, uuid, uuid);
DROP FUNCTION IF EXISTS public.open_chest_batch_secure(uuid, uuid, integer, uuid[], uuid[], integer);

-- 2. 新版单开（4 参数，无 p_item_id）
CREATE OR REPLACE FUNCTION public.open_chest_secure(
  p_user_id    uuid,
  p_chest_id   uuid,
  p_price      integer,
  p_request_id uuid
) RETURNS json
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_balance          integer;
  v_user_stars            integer;
  v_case_quantity         integer;
  v_claimed_id            uuid;
  v_event_item_id         uuid;
  v_event_balance_after   integer;
  v_event_stars_after     integer;
  v_event_case_qty_after  integer;
  v_picked_item_id        uuid;
BEGIN
  -- 0) 幂等抢占：抢到则继续，否则返回历史结果
  INSERT INTO chest_open_events (user_id, case_id, request_id, price, created_at)
  VALUES (p_user_id, p_chest_id, p_request_id, p_price, now())
  ON CONFLICT (user_id, request_id) DO NOTHING
  RETURNING id INTO v_claimed_id;

  IF v_claimed_id IS NULL THEN
    SELECT item_id, balance_after, stars_after, case_quantity_after
      INTO v_event_item_id, v_event_balance_after, v_event_stars_after, v_event_case_qty_after
    FROM chest_open_events
    WHERE user_id = p_user_id AND request_id = p_request_id
    FOR UPDATE;

    RETURN json_build_object(
      'success',           true,
      'already_processed', true,
      'item_id',           v_event_item_id,
      'assets',            json_build_object('balance', v_event_balance_after, 'stars', v_event_stars_after),
      'case_quantity_after', v_event_case_qty_after
    );
  END IF;

  -- 1) 锁用户行，检查余额
  SELECT balance, stars INTO v_user_balance, v_user_stars
  FROM users WHERE id = p_user_id FOR UPDATE;

  IF v_user_balance IS NULL THEN RAISE EXCEPTION 'User not found'; END IF;
  IF v_user_balance < p_price    THEN RAISE EXCEPTION 'Insufficient balance'; END IF;

  -- 2) 锁宝箱库存行，检查数量
  SELECT quantity INTO v_case_quantity
  FROM user_cases WHERE user_id = p_user_id AND case_id = p_chest_id FOR UPDATE;

  IF v_case_quantity IS NULL OR v_case_quantity <= 0 THEN
    RAISE EXCEPTION 'Not enough chests';
  END IF;

  -- 3) DB 侧加权随机抽奖（Gumbel-max trick：按 drop_chance 权重抽 1 个）
  --    random() ^ (1/w) 等价于按权重 w 进行无放回 Gumbel 采样，取最大值即中奖物品
  SELECT item_id INTO v_picked_item_id
  FROM case_items
  WHERE case_id = p_chest_id AND drop_chance > 0
  ORDER BY (random() ^ (1.0 / drop_chance::float8)) DESC
  LIMIT 1;

  IF v_picked_item_id IS NULL THEN
    RAISE EXCEPTION 'No items configured for this chest';
  END IF;

  -- 4) 扣余额
  UPDATE users SET balance = balance - p_price WHERE id = p_user_id;

  -- 5) 扣宝箱
  UPDATE user_cases
  SET quantity = quantity - 1, updated_at = now()
  WHERE user_id = p_user_id AND case_id = p_chest_id;

  -- 6) 发放物品
  INSERT INTO user_items (user_id, item_id, quantity, created_at, updated_at)
  VALUES (p_user_id, v_picked_item_id, 1, now(), now())
  ON CONFLICT (user_id, item_id)
  DO UPDATE SET quantity = user_items.quantity + 1, updated_at = now();

  -- 7) 读取事后快照
  SELECT balance, stars INTO v_event_balance_after, v_event_stars_after
  FROM users WHERE id = p_user_id;

  SELECT quantity INTO v_event_case_qty_after
  FROM user_cases WHERE user_id = p_user_id AND case_id = p_chest_id;

  -- 8) 填充事件记录（抢占的那行），保证幂等 key 对应唯一结果
  UPDATE chest_open_events
  SET
    item_id              = v_picked_item_id,
    balance_before       = v_user_balance,
    balance_after        = v_event_balance_after,
    stars_before         = v_user_stars,
    stars_after          = v_event_stars_after,
    case_quantity_before = v_case_quantity,
    case_quantity_after  = v_event_case_qty_after
  WHERE id = v_claimed_id;

  RETURN json_build_object(
    'success',           true,
    'already_processed', false,
    'item_id',           v_picked_item_id,
    'assets',            json_build_object('balance', v_event_balance_after, 'stars', v_event_stars_after),
    'case_quantity_after', v_event_case_qty_after
  );
END;
$$;

-- 3. 新版批量开箱（5 参数，无 p_item_ids）
CREATE OR REPLACE FUNCTION public.open_chest_batch_secure(
  p_user_id     uuid,
  p_chest_id    uuid,
  p_price       integer,
  p_request_ids uuid[],
  p_times       integer
) RETURNS json
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_balance    integer;
  v_user_stars      integer;
  v_case_quantity   integer;
  v_pending_count   integer;
  v_balance_after   integer;
  v_stars_after     integer;
  v_case_qty_after  integer;
  v_claimed_id      uuid;
  v_hist_item_id    uuid;
  v_results         jsonb  := '[]'::jsonb;
  v_already_count   integer := 0;
  v_cur_balance     integer;
  v_cur_case_qty    integer;
  v_picked_item_id  uuid;
  i                 integer;
BEGIN
  -- 参数自检
  IF p_times < 1 OR p_times > 10 THEN
    RAISE EXCEPTION 'Invalid times: must be between 1 and 10';
  END IF;
  IF array_length(p_request_ids, 1) IS NULL OR array_length(p_request_ids, 1) <> p_times THEN
    RAISE EXCEPTION 'Array length mismatch: request_ids';
  END IF;
  IF p_price <= 0 THEN
    RAISE EXCEPTION 'Invalid price';
  END IF;

  -- 统计本批中已处理的次数（幂等重试场景）
  SELECT p_times - COUNT(*) INTO v_pending_count
  FROM chest_open_events
  WHERE user_id = p_user_id AND request_id = ANY(p_request_ids);

  -- 锁用户行
  SELECT balance, stars INTO v_user_balance, v_user_stars
  FROM users WHERE id = p_user_id FOR UPDATE;

  IF v_user_balance IS NULL THEN RAISE EXCEPTION 'User not found'; END IF;

  v_cur_balance := v_user_balance;

  IF v_pending_count > 0 THEN
    IF v_user_balance < p_price * v_pending_count THEN
      RAISE EXCEPTION 'Insufficient balance';
    END IF;

    SELECT quantity INTO v_case_quantity
    FROM user_cases WHERE user_id = p_user_id AND case_id = p_chest_id FOR UPDATE;

    IF v_case_quantity IS NULL OR v_case_quantity < v_pending_count THEN
      RAISE EXCEPTION 'Not enough chests';
    END IF;

    v_cur_case_qty := v_case_quantity;
  ELSE
    SELECT COALESCE(quantity, 0) INTO v_cur_case_qty
    FROM user_cases WHERE user_id = p_user_id AND case_id = p_chest_id;
  END IF;

  -- 逐次开箱
  FOR i IN 1..p_times LOOP
    v_claimed_id := NULL;

    INSERT INTO chest_open_events (user_id, case_id, request_id, price, created_at)
    VALUES (p_user_id, p_chest_id, p_request_ids[i], p_price, now())
    ON CONFLICT (user_id, request_id) DO NOTHING
    RETURNING id INTO v_claimed_id;

    IF v_claimed_id IS NULL THEN
      -- 已处理：返回历史结果
      SELECT item_id INTO v_hist_item_id
      FROM chest_open_events
      WHERE user_id = p_user_id AND request_id = p_request_ids[i];

      v_results     := v_results || jsonb_build_object('index', i - 1, 'item_id', v_hist_item_id, 'already_processed', true);
      v_already_count := v_already_count + 1;
      CONTINUE;
    END IF;

    -- DB 侧加权随机抽奖（Gumbel-max trick）
    SELECT item_id INTO v_picked_item_id
    FROM case_items
    WHERE case_id = p_chest_id AND drop_chance > 0
    ORDER BY (random() ^ (1.0 / drop_chance::float8)) DESC
    LIMIT 1;

    IF v_picked_item_id IS NULL THEN
      RAISE EXCEPTION 'No items configured for this chest';
    END IF;

    -- 扣余额 & 宝箱
    UPDATE users SET balance = balance - p_price WHERE id = p_user_id;
    UPDATE user_cases SET quantity = quantity - 1, updated_at = now()
    WHERE user_id = p_user_id AND case_id = p_chest_id;

    v_cur_balance  := v_cur_balance  - p_price;
    v_cur_case_qty := v_cur_case_qty - 1;

    -- 发放物品
    INSERT INTO user_items (user_id, item_id, quantity, created_at, updated_at)
    VALUES (p_user_id, v_picked_item_id, 1, now(), now())
    ON CONFLICT (user_id, item_id)
    DO UPDATE SET quantity = user_items.quantity + 1, updated_at = now();

    -- 事件快照
    UPDATE chest_open_events
    SET
      item_id              = v_picked_item_id,
      balance_before       = v_cur_balance + p_price,
      balance_after        = v_cur_balance,
      stars_before         = v_user_stars,
      stars_after          = v_user_stars,
      case_quantity_before = v_cur_case_qty + 1,
      case_quantity_after  = v_cur_case_qty
    WHERE id = v_claimed_id;

    v_results := v_results || jsonb_build_object('index', i - 1, 'item_id', v_picked_item_id, 'already_processed', false);
  END LOOP;

  -- 最终快照
  SELECT balance, stars INTO v_balance_after, v_stars_after FROM users WHERE id = p_user_id;
  SELECT COALESCE(quantity, 0) INTO v_case_qty_after FROM user_cases WHERE user_id = p_user_id AND case_id = p_chest_id;

  RETURN json_build_object(
    'success',               true,
    'items',                 v_results,
    'already_processed_count', v_already_count,
    'assets',                json_build_object('balance', v_balance_after, 'stars', v_stars_after),
    'case_quantity_after',   v_case_qty_after
  );
END;
$$;
