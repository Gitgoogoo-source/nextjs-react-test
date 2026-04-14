CREATE TABLE IF NOT EXISTS user_items (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  item_id uuid REFERENCES items(id) ON DELETE CASCADE,
  quantity integer DEFAULT 1,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, item_id)
);

CREATE OR REPLACE FUNCTION open_chest_secure(
  p_user_id uuid,
  p_chest_id text,
  p_price integer,
  p_item_id uuid
) RETURNS json AS $$
DECLARE
  v_user_balance integer;
  v_case_quantity integer;
  v_user_item_id uuid;
  v_user_item_quantity integer;
BEGIN
  -- 1. Lock the user row to prevent concurrent balance updates
  SELECT balance INTO v_user_balance
  FROM users
  WHERE id = p_user_id
  FOR UPDATE;

  IF v_user_balance IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  IF v_user_balance < p_price THEN
    RAISE EXCEPTION 'Insufficient balance';
  END IF;

  -- 2. Lock the user_cases row to prevent concurrent chest deductions
  SELECT quantity INTO v_case_quantity
  FROM user_cases
  WHERE user_id = p_user_id AND case_id = p_chest_id
  FOR UPDATE;

  IF v_case_quantity IS NULL OR v_case_quantity <= 0 THEN
    RAISE EXCEPTION 'Not enough chests';
  END IF;

  -- 3. Deduct balance
  UPDATE users
  SET balance = balance - p_price
  WHERE id = p_user_id;

  -- 4. Deduct chest
  UPDATE user_cases
  SET quantity = quantity - 1, updated_at = now()
  WHERE user_id = p_user_id AND case_id = p_chest_id;

  -- 5. Add item to user_items
  SELECT id, quantity INTO v_user_item_id, v_user_item_quantity
  FROM user_items
  WHERE user_id = p_user_id AND item_id = p_item_id
  FOR UPDATE;

  IF v_user_item_id IS NOT NULL THEN
    UPDATE user_items
    SET quantity = quantity + 1, updated_at = now()
    WHERE id = v_user_item_id;
  ELSE
    INSERT INTO user_items (user_id, item_id, quantity, created_at, updated_at)
    VALUES (p_user_id, p_item_id, 1, now(), now());
  END IF;

  RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql;
