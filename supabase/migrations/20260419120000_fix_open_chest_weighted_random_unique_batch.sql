-- 修复十连（及单开）抽奖异常：
-- 1) 原 Gumbel-max 写法 `ORDER BY (random() ^ (1/w))` 在部分执行计划下可能导致
--    多次抽样落在同一行（表现为十连 10 次同一藏品）。
-- 2) 十连改为「池内仍有未抽过物品时不放回」：在 eligible 集合上做一次随机数 + 累积权重，
--    保证当掉落池物品数 >= 10 时，同一批十连不会重复（与产品设计一致）。
-- 单开仍为有放回加权随机（与单次开箱语义一致）。

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

  SELECT balance, stars INTO v_user_balance, v_user_stars
  FROM users WHERE id = p_user_id FOR UPDATE;

  IF v_user_balance IS NULL THEN RAISE EXCEPTION 'User not found'; END IF;
  IF v_user_balance < p_price    THEN RAISE EXCEPTION 'Insufficient balance'; END IF;

  SELECT quantity INTO v_case_quantity
  FROM user_cases WHERE user_id = p_user_id AND case_id = p_chest_id FOR UPDATE;

  IF v_case_quantity IS NULL OR v_case_quantity <= 0 THEN
    RAISE EXCEPTION 'Not enough chests';
  END IF;

  -- 累积权重 + 单次 random()：标准加权有放回抽样
  SELECT sub.item_id INTO v_picked_item_id
  FROM (
    SELECT ci.item_id,
      sum(ci.drop_chance) OVER (ORDER BY ci.item_id) AS cum
    FROM case_items ci
    WHERE ci.case_id = p_chest_id AND ci.drop_chance > 0
  ) sub
  CROSS JOIN LATERAL (
    SELECT random() * (SELECT sum(ci2.drop_chance)::float8 FROM case_items ci2
      WHERE ci2.case_id = p_chest_id AND ci2.drop_chance > 0
    ) AS pick_val
  ) r
  WHERE r.pick_val < sub.cum
  ORDER BY sub.cum ASC
  LIMIT 1;

  IF v_picked_item_id IS NULL THEN
    RAISE EXCEPTION 'No items configured for this chest';
  END IF;

  UPDATE users SET balance = balance - p_price WHERE id = p_user_id;

  UPDATE user_cases
  SET quantity = quantity - 1, updated_at = now()
  WHERE user_id = p_user_id AND case_id = p_chest_id;

  INSERT INTO user_items (user_id, item_id, quantity, created_at, updated_at)
  VALUES (p_user_id, v_picked_item_id, 1, now(), now())
  ON CONFLICT (user_id, item_id)
  DO UPDATE SET quantity = user_items.quantity + 1, updated_at = now();

  SELECT balance, stars INTO v_event_balance_after, v_event_stars_after
  FROM users WHERE id = p_user_id;

  SELECT quantity INTO v_event_case_qty_after
  FROM user_cases WHERE user_id = p_user_id AND case_id = p_chest_id;

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
  v_batch_picked    uuid[] := ARRAY[]::uuid[];
  v_pool_count      integer;
  i                 integer;
BEGIN
  IF p_times < 1 OR p_times > 10 THEN
    RAISE EXCEPTION 'Invalid times: must be between 1 and 10';
  END IF;
  IF array_length(p_request_ids, 1) IS NULL OR array_length(p_request_ids, 1) <> p_times THEN
    RAISE EXCEPTION 'Array length mismatch: request_ids';
  END IF;
  IF p_price <= 0 THEN
    RAISE EXCEPTION 'Invalid price';
  END IF;

  SELECT count(*)::integer INTO v_pool_count
  FROM case_items
  WHERE case_id = p_chest_id AND drop_chance > 0;

  IF v_pool_count IS NULL OR v_pool_count <= 0 THEN
    RAISE EXCEPTION 'No items configured for this chest';
  END IF;

  SELECT p_times - COUNT(*) INTO v_pending_count
  FROM chest_open_events
  WHERE user_id = p_user_id AND request_id = ANY(p_request_ids);

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

  FOR i IN 1..p_times LOOP
    v_claimed_id := NULL;

    INSERT INTO chest_open_events (user_id, case_id, request_id, price, created_at)
    VALUES (p_user_id, p_chest_id, p_request_ids[i], p_price, now())
    ON CONFLICT (user_id, request_id) DO NOTHING
    RETURNING id INTO v_claimed_id;

    IF v_claimed_id IS NULL THEN
      SELECT item_id INTO v_hist_item_id
      FROM chest_open_events
      WHERE user_id = p_user_id AND request_id = p_request_ids[i];

      v_results     := v_results || jsonb_build_object('index', i - 1, 'item_id', v_hist_item_id, 'already_processed', true);
      v_already_count := v_already_count + 1;
      CONTINUE;
    END IF;

    -- 本批内：已抽过的种类数 < 池子大小时不放回，否则恢复为池内全量有放回
    SELECT sub.item_id INTO v_picked_item_id
    FROM (
      SELECT ci.item_id,
        sum(ci.drop_chance) OVER (ORDER BY ci.item_id) AS cum
      FROM case_items ci
      WHERE ci.case_id = p_chest_id AND ci.drop_chance > 0
        AND (
          cardinality(v_batch_picked) >= v_pool_count
          OR NOT (ci.item_id = ANY(v_batch_picked))
        )
    ) sub
    CROSS JOIN LATERAL (
      SELECT random() * (
        SELECT coalesce(sum(ci2.drop_chance), 0)::float8
        FROM case_items ci2
        WHERE ci2.case_id = p_chest_id AND ci2.drop_chance > 0
          AND (
            cardinality(v_batch_picked) >= v_pool_count
            OR NOT (ci2.item_id = ANY(v_batch_picked))
          )
      ) AS pick_val
    ) r
    WHERE r.pick_val < sub.cum
    ORDER BY sub.cum ASC
    LIMIT 1;

    IF v_picked_item_id IS NULL THEN
      RAISE EXCEPTION 'No items configured for this chest';
    END IF;

    v_batch_picked := array_append(v_batch_picked, v_picked_item_id);

    UPDATE users SET balance = balance - p_price WHERE id = p_user_id;
    UPDATE user_cases SET quantity = quantity - 1, updated_at = now()
    WHERE user_id = p_user_id AND case_id = p_chest_id;

    v_cur_balance  := v_cur_balance  - p_price;
    v_cur_case_qty := v_cur_case_qty - 1;

    INSERT INTO user_items (user_id, item_id, quantity, created_at, updated_at)
    VALUES (p_user_id, v_picked_item_id, 1, now(), now())
    ON CONFLICT (user_id, item_id)
    DO UPDATE SET quantity = user_items.quantity + 1, updated_at = now();

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
