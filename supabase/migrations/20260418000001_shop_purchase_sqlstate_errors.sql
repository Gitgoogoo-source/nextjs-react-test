-- 将 shop_purchase 函数改为使用 SQLSTATE 错误代码
-- 这样 TypeScript 端可以通过 err.code 来判断错误类型，而不是依赖易变的错误消息

CREATE OR REPLACE FUNCTION shop_purchase(
  p_user_id uuid,
  p_product_id uuid,
  p_quantity integer,
  p_request_id uuid
) RETURNS json AS $$
DECLARE
  v_claimed_id uuid;
  v_existing_status text;
  v_existing_total bigint;

  v_user_balance bigint;
  v_user_stars bigint;
  v_balance_after bigint;
  v_stars_after bigint;

  v_product_type text;
  v_case_id uuid;
  v_item_id uuid;
  v_currency text;
  v_unit_price bigint;
  v_total_price bigint;

  v_user_case_id uuid;
  v_user_item_id uuid;
  v_final_quantity integer;
BEGIN
  IF p_quantity IS NULL OR p_quantity <= 0 OR p_quantity > 100 THEN
    RAISE EXCEPTION 'Invalid quantity' USING ERRCODE = 'P0004';
  END IF;

  -- 0) 幂等/并发安全：先"抢占"订单行。冲突时等待并返回已有结果。
  -- 这里先用占位字段（currency/unit_price/total_price 由 DB 内部计算），确保前端无法影响。
  INSERT INTO purchase_orders (user_id, product_id, request_id, quantity, status, currency, unit_price, total_price, created_at, updated_at)
  VALUES (p_user_id, p_product_id, p_request_id, p_quantity, 'pending', 'balance', 0, 0, now(), now())
  ON CONFLICT (user_id, request_id) DO NOTHING
  RETURNING id INTO v_claimed_id;

  IF v_claimed_id IS NULL THEN
    SELECT status, total_price
      INTO v_existing_status, v_existing_total
    FROM purchase_orders
    WHERE user_id = p_user_id AND request_id = p_request_id
    FOR UPDATE;

    RETURN json_build_object(
      'success', (v_existing_status = 'succeeded'),
      'already_processed', true,
      'status', v_existing_status,
      'total_price', v_existing_total
    );
  END IF;

  -- 1) 锁定用户行，读取资产快照
  SELECT balance, stars INTO v_user_balance, v_user_stars
  FROM users
  WHERE id = p_user_id
  FOR UPDATE;

  IF v_user_balance IS NULL THEN
    UPDATE purchase_orders SET status = 'failed' WHERE id = v_claimed_id;
    RAISE EXCEPTION 'User not found' USING ERRCODE = 'P0005';
  END IF;

  -- 2) 锁定商品行：确保 is_active / price / currency 一致
  SELECT product_type, case_id, item_id, currency, price
    INTO v_product_type, v_case_id, v_item_id, v_currency, v_unit_price
  FROM shop_products
  WHERE id = p_product_id AND is_active = true
  FOR UPDATE;

  IF v_product_type IS NULL THEN
    UPDATE purchase_orders SET status = 'failed' WHERE id = v_claimed_id;
    RAISE EXCEPTION 'Product not found or inactive' USING ERRCODE = 'P0003';
  END IF;

  -- 3) 计算总价（bigint），并做基本安全检查
  v_total_price := v_unit_price * p_quantity;
  IF v_total_price < 0 THEN
    UPDATE purchase_orders SET status = 'failed' WHERE id = v_claimed_id;
    RAISE EXCEPTION 'Invalid total price' USING ERRCODE = 'P0006';
  END IF;

  -- 4) 扣资源（根据 currency 选择字段）
  IF v_currency = 'balance' THEN
    IF v_user_balance < v_total_price THEN
      UPDATE purchase_orders SET status = 'failed' WHERE id = v_claimed_id;
      RAISE EXCEPTION 'Insufficient balance' USING ERRCODE = 'P0001';
    END IF;
    UPDATE users SET balance = balance - v_total_price WHERE id = p_user_id;
  ELSIF v_currency = 'stars' THEN
    IF COALESCE(v_user_stars, 0) < v_total_price THEN
      UPDATE purchase_orders SET status = 'failed' WHERE id = v_claimed_id;
      RAISE EXCEPTION 'Insufficient stars' USING ERRCODE = 'P0002';
    END IF;
    UPDATE users SET stars = stars - v_total_price WHERE id = p_user_id;
  ELSE
    UPDATE purchase_orders SET status = 'failed' WHERE id = v_claimed_id;
    RAISE EXCEPTION 'Unsupported currency' USING ERRCODE = 'P0007';
  END IF;

  -- 5) 发货：加库存（case -> user_cases；item -> user_items）
  IF v_product_type = 'case' THEN
    SELECT id INTO v_user_case_id
    FROM user_cases
    WHERE user_id = p_user_id AND case_id = v_case_id
    FOR UPDATE;

    IF v_user_case_id IS NOT NULL THEN
      UPDATE user_cases
      SET quantity = quantity + p_quantity, updated_at = now()
      WHERE id = v_user_case_id
      RETURNING quantity INTO v_final_quantity;
    ELSE
      INSERT INTO user_cases (user_id, case_id, quantity, created_at, updated_at)
      VALUES (p_user_id, v_case_id, p_quantity, now(), now())
      ON CONFLICT (user_id, case_id)
      DO UPDATE SET quantity = user_cases.quantity + EXCLUDED.quantity, updated_at = now()
      RETURNING quantity INTO v_final_quantity;
    END IF;
  ELSIF v_product_type = 'item' THEN
    SELECT id INTO v_user_item_id
    FROM user_items
    WHERE user_id = p_user_id AND item_id = v_item_id
    FOR UPDATE;

    IF v_user_item_id IS NOT NULL THEN
      UPDATE user_items
      SET quantity = quantity + p_quantity, updated_at = now()
      WHERE id = v_user_item_id
      RETURNING quantity INTO v_final_quantity;
    ELSE
      INSERT INTO user_items (user_id, item_id, quantity, created_at, updated_at)
      VALUES (p_user_id, v_item_id, p_quantity, now(), now())
      ON CONFLICT (user_id, item_id)
      DO UPDATE SET quantity = user_items.quantity + EXCLUDED.quantity, updated_at = now()
      RETURNING quantity INTO v_final_quantity;
    END IF;
  ELSE
    UPDATE purchase_orders SET status = 'failed' WHERE id = v_claimed_id;
    RAISE EXCEPTION 'Unsupported product_type' USING ERRCODE = 'P0008';
  END IF;

  -- 6) 读取扣款后的资产（同事务内一致）
  SELECT balance, stars INTO v_balance_after, v_stars_after
  FROM users
  WHERE id = p_user_id;

  -- 7) 填充订单（以 DB 内的计算结果为准）
  UPDATE purchase_orders
  SET
    status = 'succeeded',
    currency = v_currency,
    unit_price = v_unit_price,
    total_price = v_total_price,
    balance_before = v_user_balance,
    balance_after = v_balance_after,
    stars_before = v_user_stars,
    stars_after = v_stars_after
  WHERE id = v_claimed_id;

  RETURN json_build_object(
    'success', true,
    'already_processed', false,
    'order_id', v_claimed_id,
    'product_type', v_product_type,
    'product_id', p_product_id,
    'case_id', v_case_id,
    'item_id', v_item_id,
    'quantity', p_quantity,
    'final_quantity', v_final_quantity,
    'currency', v_currency,
    'unit_price', v_unit_price,
    'total_price', v_total_price,
    'assets', json_build_object('balance', v_balance_after, 'stars', v_stars_after)
  );
END;
$$ LANGUAGE plpgsql;
