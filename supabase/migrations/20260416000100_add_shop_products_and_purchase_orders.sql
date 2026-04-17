-- 商城商品与购买订单（服务端可信来源 + 幂等 + 原子事务）
-- 设计目标：
-- 1) 前端不可信：价格/币种/是否上架等必须以 DB 的 shop_products 为准
-- 2) 幂等：同一 user_id + request_id 只能成功一次（断网/重试不重复扣款/发货）
-- 3) 原子性：扣资源 + 加库存 + 记订单 必须在同一事务内完成（PL/pgSQL + 行级锁）

-- 商品类型与币种（用 text + CHECK，避免 enum 迁移的复杂度）

CREATE TABLE IF NOT EXISTS shop_products (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  product_type text NOT NULL CHECK (product_type IN ('case', 'item')),
  case_id uuid REFERENCES cases(id) ON DELETE RESTRICT,
  item_id uuid REFERENCES items(id) ON DELETE RESTRICT,
  title text NOT NULL,
  description text,
  currency text NOT NULL CHECK (currency IN ('balance', 'stars')),
  price bigint NOT NULL CHECK (price >= 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- 约束：case 类型必须绑定 case_id；item 类型必须绑定 item_id；且二者不能同时存在
  CONSTRAINT shop_products_target_check CHECK (
    (product_type = 'case' AND case_id IS NOT NULL AND item_id IS NULL)
    OR
    (product_type = 'item' AND item_id IS NOT NULL AND case_id IS NULL)
  )
);

-- 防止重复上架同一个目标（按币种区分定价）
CREATE UNIQUE INDEX IF NOT EXISTS shop_products_unique_case_currency
  ON shop_products (case_id, currency)
  WHERE product_type = 'case' AND case_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS shop_products_unique_item_currency
  ON shop_products (item_id, currency)
  WHERE product_type = 'item' AND item_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS shop_products_active_idx
  ON shop_products (is_active, product_type, currency);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES shop_products(id) ON DELETE RESTRICT,
  request_id uuid NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0 AND quantity <= 100),
  status text NOT NULL CHECK (status IN ('pending', 'succeeded', 'failed')) DEFAULT 'pending',
  currency text NOT NULL CHECK (currency IN ('balance', 'stars')),
  unit_price bigint NOT NULL CHECK (unit_price >= 0),
  total_price bigint NOT NULL CHECK (total_price >= 0),
  balance_before bigint,
  balance_after bigint,
  stars_before bigint,
  stars_after bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, request_id)
);

CREATE INDEX IF NOT EXISTS purchase_orders_user_created_at_idx
  ON purchase_orders (user_id, created_at DESC);

-- 自动维护 updated_at（轻量 trigger）
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_shop_products_updated_at ON shop_products;
CREATE TRIGGER trg_shop_products_updated_at
BEFORE UPDATE ON shop_products
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_purchase_orders_updated_at ON purchase_orders;
CREATE TRIGGER trg_purchase_orders_updated_at
BEFORE UPDATE ON purchase_orders
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 原子购买 RPC（由服务端使用 service role 调用）
-- 不接受前端传 price/currency，全部从 shop_products 读取并加锁
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
    RAISE EXCEPTION 'Invalid quantity';
  END IF;

  -- 0) 幂等/并发安全：先“抢占”订单行。冲突时等待并返回已有结果。
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
    RAISE EXCEPTION 'User not found';
  END IF;

  -- 2) 锁定商品行：确保 is_active / price / currency 一致
  SELECT product_type, case_id, item_id, currency, price
    INTO v_product_type, v_case_id, v_item_id, v_currency, v_unit_price
  FROM shop_products
  WHERE id = p_product_id AND is_active = true
  FOR UPDATE;

  IF v_product_type IS NULL THEN
    UPDATE purchase_orders SET status = 'failed' WHERE id = v_claimed_id;
    RAISE EXCEPTION 'Product not found or inactive';
  END IF;

  -- 3) 计算总价（bigint），并做基本安全检查
  v_total_price := v_unit_price * p_quantity;
  IF v_total_price < 0 THEN
    UPDATE purchase_orders SET status = 'failed' WHERE id = v_claimed_id;
    RAISE EXCEPTION 'Invalid total price';
  END IF;

  -- 4) 扣资源（根据 currency 选择字段）
  IF v_currency = 'balance' THEN
    IF v_user_balance < v_total_price THEN
      UPDATE purchase_orders SET status = 'failed' WHERE id = v_claimed_id;
      RAISE EXCEPTION 'Insufficient balance';
    END IF;
    UPDATE users SET balance = balance - v_total_price WHERE id = p_user_id;
  ELSIF v_currency = 'stars' THEN
    IF COALESCE(v_user_stars, 0) < v_total_price THEN
      UPDATE purchase_orders SET status = 'failed' WHERE id = v_claimed_id;
      RAISE EXCEPTION 'Insufficient stars';
    END IF;
    UPDATE users SET stars = stars - v_total_price WHERE id = p_user_id;
  ELSE
    UPDATE purchase_orders SET status = 'failed' WHERE id = v_claimed_id;
    RAISE EXCEPTION 'Unsupported currency';
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
    RAISE EXCEPTION 'Unsupported product_type';
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

-- 可选：为现有 cases 自动生成可售商品（不硬编码 ID；价格仍以 cases.price 为准）
-- 默认以 balance 计价；如需 stars 计价可在后台修改 shop_products.currency/price
INSERT INTO shop_products (product_type, case_id, title, description, currency, price, is_active)
SELECT
  'case',
  c.id,
  c.name,
  c.description,
  'balance',
  c.price,
  true
FROM cases c
WHERE c.price IS NOT NULL
ON CONFLICT DO NOTHING;

