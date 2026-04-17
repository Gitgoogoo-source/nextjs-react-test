-- 开箱幂等与可追溯
-- 目标：
-- 1) 断网/超时/重试时，避免重复扣箱/重复发奖（幂等 request_id）
-- 2) 保存开箱事件，便于审计与客服补偿

CREATE TABLE IF NOT EXISTS chest_open_events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  case_id uuid REFERENCES cases(id) ON DELETE RESTRICT,
  request_id uuid NOT NULL,
  item_id uuid REFERENCES items(id) ON DELETE RESTRICT,
  price integer NOT NULL,
  balance_before integer,
  balance_after integer,
  stars_before integer,
  stars_after integer,
  case_quantity_before integer,
  case_quantity_after integer,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, request_id)
);

-- 旧签名（无 request_id）会导致无法幂等，且 PostgREST 对重载不稳定，因此明确删除旧版本
DROP FUNCTION IF EXISTS public.open_chest_secure(uuid, uuid, integer, uuid);

CREATE OR REPLACE FUNCTION open_chest_secure(
  p_user_id uuid,
  p_chest_id uuid,
  p_price integer,
  p_item_id uuid,
  p_request_id uuid
) RETURNS json AS $$
DECLARE
  v_user_balance integer;
  v_user_stars integer;
  v_case_quantity integer;
  v_user_item_id uuid;
  v_claimed_id uuid;
  v_event_item_id uuid;
  v_event_balance_after integer;
  v_event_stars_after integer;
  v_event_case_quantity_after integer;
BEGIN
  -- 0) 幂等/并发安全：先“抢占”该 request_id。抢占失败则等待对方提交后返回同一结果。
  INSERT INTO chest_open_events (user_id, case_id, request_id, price, created_at)
  VALUES (p_user_id, p_chest_id, p_request_id, p_price, now())
  ON CONFLICT (user_id, request_id) DO NOTHING
  RETURNING id INTO v_claimed_id;

  IF v_claimed_id IS NULL THEN
    -- 另一事务已处理或正在处理中：FOR UPDATE 会等待对方完成，避免读到半成品
    SELECT item_id, balance_after, stars_after, case_quantity_after
      INTO v_event_item_id, v_event_balance_after, v_event_stars_after, v_event_case_quantity_after
    FROM chest_open_events
    WHERE user_id = p_user_id AND request_id = p_request_id
    FOR UPDATE;

    RETURN json_build_object(
      'success', true,
      'already_processed', true,
      'item_id', v_event_item_id,
      'assets', json_build_object('balance', v_event_balance_after, 'stars', v_event_stars_after),
      'case_quantity_after', v_event_case_quantity_after
    );
  END IF;

  -- 1) Lock the user row to prevent concurrent balance updates
  SELECT balance, stars INTO v_user_balance, v_user_stars
  FROM users
  WHERE id = p_user_id
  FOR UPDATE;

  IF v_user_balance IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  IF v_user_balance < p_price THEN
    RAISE EXCEPTION 'Insufficient balance';
  END IF;

  -- 2) Lock the user_cases row to prevent concurrent chest deductions
  SELECT quantity INTO v_case_quantity
  FROM user_cases
  WHERE user_id = p_user_id AND case_id = p_chest_id
  FOR UPDATE;

  IF v_case_quantity IS NULL OR v_case_quantity <= 0 THEN
    RAISE EXCEPTION 'Not enough chests';
  END IF;

  -- 3) Deduct balance
  UPDATE users
  SET balance = balance - p_price
  WHERE id = p_user_id;

  -- 4) Deduct chest
  UPDATE user_cases
  SET quantity = quantity - 1, updated_at = now()
  WHERE user_id = p_user_id AND case_id = p_chest_id;

  -- 5) Add item to user_items (locked)
  SELECT id INTO v_user_item_id
  FROM user_items
  WHERE user_id = p_user_id AND item_id = p_item_id
  FOR UPDATE;

  IF v_user_item_id IS NOT NULL THEN
    UPDATE user_items
    SET quantity = quantity + 1, updated_at = now()
    WHERE id = v_user_item_id;
  ELSE
    INSERT INTO user_items (user_id, item_id, quantity, created_at, updated_at)
    VALUES (p_user_id, p_item_id, 1, now(), now())
    ON CONFLICT (user_id, item_id)
    DO UPDATE SET quantity = user_items.quantity + 1, updated_at = now();
  END IF;

  -- 6) Read after values (still in same transaction, consistent)
  SELECT balance, stars INTO v_event_balance_after, v_event_stars_after
  FROM users
  WHERE id = p_user_id;

  SELECT quantity INTO v_event_case_quantity_after
  FROM user_cases
  WHERE user_id = p_user_id AND case_id = p_chest_id;

  -- 7) 填充事件（已抢占的那一行），确保幂等 key 对应唯一结果
  UPDATE chest_open_events
  SET
    item_id = p_item_id,
    balance_before = v_user_balance,
    balance_after = v_event_balance_after,
    stars_before = v_user_stars,
    stars_after = v_event_stars_after,
    case_quantity_before = v_case_quantity,
    case_quantity_after = v_event_case_quantity_after
  WHERE id = v_claimed_id;

  RETURN json_build_object(
    'success', true,
    'already_processed', false,
    'item_id', p_item_id,
    'assets', json_build_object('balance', v_event_balance_after, 'stars', v_event_stars_after),
    'case_quantity_after', v_event_case_quantity_after
  );
END;
$$ LANGUAGE plpgsql;

