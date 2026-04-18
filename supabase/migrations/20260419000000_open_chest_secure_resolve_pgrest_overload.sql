-- PGRST203: PostgREST 无法在 JSON 数字与两种重载之间选择
-- public.open_chest_secure(..., p_price integer, ...) 与
-- public.open_chest_secure(..., p_price bigint, ...) 并存时 rpc 报错。
-- 删除全部五参数重载后，仅保留 integer 版本（与 chest_open_events.price、历史迁移一致）。

DROP FUNCTION IF EXISTS public.open_chest_secure(uuid, uuid, integer, uuid, uuid);
DROP FUNCTION IF EXISTS public.open_chest_secure(uuid, uuid, bigint, uuid, uuid);

CREATE OR REPLACE FUNCTION public.open_chest_secure(
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
  INSERT INTO chest_open_events (user_id, case_id, request_id, price, created_at)
  VALUES (p_user_id, p_chest_id, p_request_id, p_price, now())
  ON CONFLICT (user_id, request_id) DO NOTHING
  RETURNING id INTO v_claimed_id;

  IF v_claimed_id IS NULL THEN
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

  SELECT quantity INTO v_case_quantity
  FROM user_cases
  WHERE user_id = p_user_id AND case_id = p_chest_id
  FOR UPDATE;

  IF v_case_quantity IS NULL OR v_case_quantity <= 0 THEN
    RAISE EXCEPTION 'Not enough chests';
  END IF;

  UPDATE users
  SET balance = balance - p_price
  WHERE id = p_user_id;

  UPDATE user_cases
  SET quantity = quantity - 1, updated_at = now()
  WHERE user_id = p_user_id AND case_id = p_chest_id;

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

  SELECT balance, stars INTO v_event_balance_after, v_event_stars_after
  FROM users
  WHERE id = p_user_id;

  SELECT quantity INTO v_event_case_quantity_after
  FROM user_cases
  WHERE user_id = p_user_id AND case_id = p_chest_id;

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
