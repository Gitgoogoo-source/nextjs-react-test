# Supabase 数据库 RPC / 函数参考

本文档描述 **`public`** 与 **`graphql_public`** schema 下的 PostgreSQL 函数（含可通过 PostgREST / `supabase.rpc()` 调用的业务函数，以及仅用于触发器的函数）。

| 项目 | 说明 |
|------|------|
| **数据来源** | Supabase MCP `execute_sql`：`pg_proc`、`pg_get_function_identity_arguments`、`pg_get_functiondef` |
| **远程项目** | `reactTest`（`project_id`: `tfgzxvabdlnkpbikgcjv`） |
| **说明** | 部署或 migration 变更后，远程定义可能与本文档不一致；请以数据库为准或重新拉取 `pg_get_functiondef`。 |

---

## 1. 约定与分类

### 1.1 客户端可调用的 RPC（`supabase.rpc`）

通常满足：返回类型为 **`json` / `jsonb` / `void` / 标量**，且对调用角色授予了 **`EXECUTE`**。下列 **「业务 RPC」** 属于此类（**不含** `RETURNS trigger`）。

调用时参数名需与函数形参一致，例如：

```ts
await supabase.rpc('open_chest_secure', {
  p_user_id: '...',
  p_chest_id: '...',
  p_price: 100,
  p_item_id: '...',
  p_request_id: '...',
});
```

### 1.2 触发器函数（不可当 RPC 使用）

返回 **`trigger`** 的函数仅供 **`CREATE TRIGGER ... EXECUTE FUNCTION ...`** 使用，**不要**通过 `rpc()` 调用。

---

## 2. `graphql_public` 函数

### 2.1 `graphql_public.graphql`

| 属性 | 值 |
|------|-----|
| **身份参数** | `"operationName" text, query text, variables jsonb, extensions jsonb` |
| **返回类型** | `jsonb` |
| **语言** | `sql` |
| **Volatile** | `VOLATILE` |
| **SECURITY DEFINER** | `false` |
| **用途** | 将请求转发给 `graphql.resolve(...)`，用于 GraphQL 查询（Supabase GraphQL 扩展）。 |

**源定义：**

```sql
CREATE OR REPLACE FUNCTION graphql_public.graphql("operationName" text DEFAULT NULL::text, query text DEFAULT NULL::text, variables jsonb DEFAULT NULL::jsonb, extensions jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE sql
AS $function$
            select graphql.resolve(
                query := query,
                variables := coalesce(variables, '{}'),
                "operationName" := "operationName",
                extensions := extensions
            );
        $function$
```

---

## 3. `public` — 业务 RPC（客户端可调）

### 3.1 `accept_invite_and_reward`

| 属性 | 值 |
|------|-----|
| **身份参数** | `p_inviter_telegram_id bigint, p_invitee_telegram_id bigint, p_invite_code text, p_reward_type text, p_amount bigint` |
| **默认参数** | `p_reward_type` 默认 `'coins'`；`p_amount` 默认 `100` |
| **返回类型** | `json` |
| **语言** | `plpgsql` |
| **Volatile** | `VOLATILE` |
| **SECURITY DEFINER** | `false` |
| **行为摘要** | 校验邀请人/被邀请人；按 `user_invites.invitee_user_id` 幂等插入；已存在则返回 `already_processed`；支持 `coins`/`points` 给邀请人增加 `balance` 并写入 `invite_rewards`（`ON CONFLICT DO NOTHING` 防重复发奖）。 |

**源定义：**

```sql
CREATE OR REPLACE FUNCTION public.accept_invite_and_reward(p_inviter_telegram_id bigint, p_invitee_telegram_id bigint, p_invite_code text, p_reward_type text DEFAULT 'coins'::text, p_amount bigint DEFAULT 100)
 RETURNS json
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_inviter_id uuid;
  v_invitee_id uuid;
  v_invitee_games_played bigint;

  v_claimed_invitation_id uuid;
  v_existing_invitation_id uuid;
  v_existing_inviter_id uuid;

  v_reward_claimed_id uuid;
  v_balance_after bigint;
BEGIN
  IF p_inviter_telegram_id IS NULL OR p_invitee_telegram_id IS NULL THEN
    RETURN json_build_object('success', false, 'reason', 'missing_telegram_id');
  END IF;

  IF p_inviter_telegram_id = p_invitee_telegram_id THEN
    -- 自己邀请自己直接忽略（表里也有 check）
    RETURN json_build_object('success', true, 'already_processed', true, 'reason', 'self_invite');
  END IF;

  -- 锁定 invitee 用户行，避免并发重复绑定邀请
  SELECT id, COALESCE(games_played, 0)
    INTO v_invitee_id, v_invitee_games_played
  FROM public.users
  WHERE telegram_id = p_invitee_telegram_id
  FOR UPDATE;

  IF v_invitee_id IS NULL THEN
    RETURN json_build_object('success', false, 'reason', 'invitee_not_found');
  END IF;

  -- inviter 不一定需要 FOR UPDATE（这里只做加币，后面会锁 inviter 行）
  SELECT id INTO v_inviter_id
  FROM public.users
  WHERE telegram_id = p_inviter_telegram_id;

  IF v_inviter_id IS NULL THEN
    RETURN json_build_object('success', false, 'reason', 'inviter_not_found');
  END IF;

  -- 先尝试插入邀请关系（幂等：invitee_user_id 唯一）
  INSERT INTO public.user_invites (
    inviter_user_id,
    invitee_user_id,
    inviter_telegram_id,
    invitee_telegram_id,
    invite_code,
    status,
    qualified_at,
    invitee_games_played_at_invite,
    created_at
  ) VALUES (
    v_inviter_id,
    v_invitee_id,
    p_inviter_telegram_id,
    p_invitee_telegram_id,
    p_invite_code,
    'qualified',
    now(),
    v_invitee_games_played,
    now()
  )
  ON CONFLICT (invitee_user_id) DO NOTHING
  RETURNING id INTO v_claimed_invitation_id;

  IF v_claimed_invitation_id IS NULL THEN
    -- 已存在邀请：读取并锁定该行，确保并发下读一致
    SELECT id, inviter_user_id
      INTO v_existing_invitation_id, v_existing_inviter_id
    FROM public.user_invites
    WHERE invitee_user_id = v_invitee_id
    FOR UPDATE;

    -- 如果该 invitee 已经被其他 inviter 绑定，则直接视为已处理，不再发奖
    RETURN json_build_object(
      'success', true,
      'already_processed', true,
      'invitation_id', v_existing_invitation_id,
      'bound_to_inviter', v_existing_inviter_id
    );
  END IF;

  -- 发奖：目前实现 coins/points（amount>0）给 inviter 的 balance
  IF p_reward_type NOT IN ('coins', 'points') THEN
    -- 先把邀请关系写入成功，但不发不支持的奖励类型
    RETURN json_build_object('success', true, 'already_processed', false, 'invitation_id', v_claimed_invitation_id, 'reward_granted', false);
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN json_build_object('success', true, 'already_processed', false, 'invitation_id', v_claimed_invitation_id, 'reward_granted', false);
  END IF;

  -- 锁 inviter 行，进行加币
  PERFORM 1 FROM public.users WHERE id = v_inviter_id FOR UPDATE;

  UPDATE public.users
  SET balance = balance + p_amount
  WHERE id = v_inviter_id
  RETURNING balance INTO v_balance_after;

  -- 写奖励记录（partial unique index 确保同一 invitation 只发一次）
  INSERT INTO public.invite_rewards (
    invitation_id,
    inviter_user_id,
    invitee_user_id,
    reward_type,
    amount,
    status,
    granted_at,
    created_at
  ) VALUES (
    v_claimed_invitation_id,
    v_inviter_id,
    v_invitee_id,
    p_reward_type,
    p_amount,
    'granted',
    now(),
    now()
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_reward_claimed_id;

  RETURN json_build_object(
    'success', true,
    'already_processed', false,
    'invitation_id', v_claimed_invitation_id,
    'reward_granted', (v_reward_claimed_id IS NOT NULL),
    'balance_after', v_balance_after
  );
END;
$function$
```

---

### 3.2 `check_and_increment_rate_limit`

| 属性 | 值 |
|------|-----|
| **身份参数** | `p_scope text, p_route text, p_limit integer, p_window_seconds integer` |
| **返回类型** | `jsonb` |
| **语言** | `plpgsql` |
| **Volatile** | `VOLATILE` |
| **SECURITY DEFINER** | **`true`** |
| **search_path** | `SET search_path TO 'public'` |
| **行为摘要** | 时间窗口对齐到整秒切片；对 `api_rate_limits` 做 `INSERT ... ON CONFLICT` 累加计数；`p_limit <= 0` 或 `p_window_seconds <= 0` 时 `RAISE EXCEPTION`。 |

**源定义：**

```sql
CREATE OR REPLACE FUNCTION public.check_and_increment_rate_limit(p_scope text, p_route text, p_limit integer, p_window_seconds integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
```

---

### 3.3 `cleanup_expired_rate_limits`

| 属性 | 值 |
|------|-----|
| **身份参数** | （无） |
| **返回类型** | `void` |
| **语言** | `sql` |
| **Volatile** | `VOLATILE` |
| **SECURITY DEFINER** | **`true`** |
| **search_path** | `SET search_path TO 'public'` |
| **行为摘要** | 删除 `api_rate_limits` 中 `updated_at` 早于「当前时间 − 1 day」的行。 |

**源定义：**

```sql
CREATE OR REPLACE FUNCTION public.cleanup_expired_rate_limits()
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  DELETE FROM public.api_rate_limits
  WHERE updated_at < now() - interval '1 day';
$function$
```

---

### 3.4 `execute_asset_transaction`

| 属性 | 值 |
|------|-----|
| **身份参数** | `p_telegram_id bigint, p_resource_type text, p_amount bigint, p_reason text` |
| **返回类型** | `json` |
| **语言** | `plpgsql` |
| **Volatile** | `VOLATILE` |
| **SECURITY DEFINER** | `false` |
| **行为摘要** | 按 `telegram_id` 解析用户；`p_resource_type` 为 `balance` 或 `stars` 时更新对应列并写入 `resource_transactions`；否则返回错误；异常时返回 `sqlerrm`。 |

**源定义：**

```sql
CREATE OR REPLACE FUNCTION public.execute_asset_transaction(p_telegram_id bigint, p_resource_type text, p_amount bigint, p_reason text)
 RETURNS json
 LANGUAGE plpgsql
AS $function$
declare
  v_user_id uuid;
  v_new_balance bigint;
begin
  select id into v_user_id
  from public.users
  where telegram_id = p_telegram_id;

  if v_user_id is null then
    return json_build_object('success', false, 'message', 'User not found');
  end if;

  if p_resource_type = 'balance' then
    update public.users
    set balance = balance + p_amount,
        updated_at = now()
    where id = v_user_id
    returning balance into v_new_balance;
  elsif p_resource_type = 'stars' then
    update public.users
    set stars = stars + p_amount,
        updated_at = now()
    where id = v_user_id
    returning stars into v_new_balance;
  else
    return json_build_object('success', false, 'message', 'Invalid resource type');
  end if;

  insert into public.resource_transactions (user_id, resource_type, amount, reason, created_at)
  values (v_user_id, p_resource_type, p_amount, p_reason, now());

  return json_build_object('success', true, 'new_balance', v_new_balance);
exception when others then
  return json_build_object('success', false, 'message', sqlerrm);
end;
$function$
```

---

### 3.5 `open_chest_secure`

| 属性 | 值 |
|------|-----|
| **身份参数** | `p_user_id uuid, p_chest_id uuid, p_price bigint, p_item_id uuid, p_request_id uuid` |
| **返回类型** | `json` |
| **语言** | `plpgsql` |
| **Volatile** | `VOLATILE` |
| **SECURITY DEFINER** | `false` |
| **行为摘要** | `chest_open_events (user_id, request_id)` 幂等抢占；扣余额与 `user_cases`；发放/合并 `user_items`；写回事件中的前后资产与箱数；重复请求返回已存结果。失败时 `RAISE EXCEPTION`（如余额不足、无箱、用户不存在）。 |

> **注意**：线上存在两个重载版本：
> - `p_price bigint` 版本（当前主版本，见下方定义）
> - `p_price integer` 版本（旧版，保留兼容性，使用 `USING ERRCODE` 返回 `99001`/`99002` 错误码）

**源定义：**

```sql
CREATE OR REPLACE FUNCTION public.open_chest_secure(p_user_id uuid, p_chest_id uuid, p_price bigint, p_item_id uuid, p_request_id uuid)
 RETURNS json
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_user_balance bigint;
  v_user_stars bigint;
  v_case_quantity integer;
  v_user_item_id uuid;
  v_claimed_id uuid;
  v_event_item_id uuid;
  v_event_balance_after bigint;
  v_event_stars_after bigint;
  v_event_case_quantity_after integer;
BEGIN
  -- 0) 幂等抢占：同一 user_id + request_id 只处理一次
  INSERT INTO public.chest_open_events (user_id, case_id, request_id, price, created_at)
  VALUES (p_user_id, p_chest_id, p_request_id, p_price, now())
  ON CONFLICT (user_id, request_id) DO NOTHING
  RETURNING id INTO v_claimed_id;

  IF v_claimed_id IS NULL THEN
    -- 已被处理或正在处理：等待对方提交后返回同一结果
    SELECT item_id, balance_after, stars_after, case_quantity_after
      INTO v_event_item_id, v_event_balance_after, v_event_stars_after, v_event_case_quantity_after
    FROM public.chest_open_events
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

  -- 1) 锁定用户行，防止并发扣余额
  SELECT balance, stars INTO v_user_balance, v_user_stars
  FROM public.users
  WHERE id = p_user_id
  FOR UPDATE;

  IF v_user_balance IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  IF v_user_balance < p_price THEN
    RAISE EXCEPTION 'Insufficient balance';
  END IF;

  -- 2) 锁定用户宝箱行，防止并发扣箱
  SELECT quantity INTO v_case_quantity
  FROM public.user_cases
  WHERE user_id = p_user_id AND case_id = p_chest_id
  FOR UPDATE;

  IF v_case_quantity IS NULL OR v_case_quantity <= 0 THEN
    RAISE EXCEPTION 'Not enough chests';
  END IF;

  -- 3) 扣余额
  UPDATE public.users
  SET balance = balance - p_price
  WHERE id = p_user_id;

  -- 4) 扣宝箱
  UPDATE public.user_cases
  SET quantity = quantity - 1, updated_at = now()
  WHERE user_id = p_user_id AND case_id = p_chest_id;

  -- 5) 发放物品（并发安全）
  SELECT id INTO v_user_item_id
  FROM public.user_items
  WHERE user_id = p_user_id AND item_id = p_item_id
  FOR UPDATE;

  IF v_user_item_id IS NOT NULL THEN
    UPDATE public.user_items
    SET quantity = quantity + 1, updated_at = now()
    WHERE id = v_user_item_id;
  ELSE
    INSERT INTO public.user_items (user_id, item_id, quantity, created_at, updated_at)
    VALUES (p_user_id, p_item_id, 1, now(), now())
    ON CONFLICT (user_id, item_id)
    DO UPDATE SET quantity = public.user_items.quantity + 1, updated_at = now();
  END IF;

  -- 6) 读取扣减后的结果（同事务一致）
  SELECT balance, stars INTO v_event_balance_after, v_event_stars_after
  FROM public.users
  WHERE id = p_user_id;

  SELECT quantity INTO v_event_case_quantity_after
  FROM public.user_cases
  WHERE user_id = p_user_id AND case_id = p_chest_id;

  -- 7) 写入事件结果，确保幂等 key 对应唯一奖品与资产结果
  UPDATE public.chest_open_events
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
$function$
```

---

### 3.6 `shop_purchase`

| 属性 | 值 |
|------|-----|
| **身份参数** | `p_user_id uuid, p_product_id uuid, p_quantity integer, p_request_id uuid` |
| **返回类型** | `json` |
| **语言** | `plpgsql` |
| **Volatile** | `VOLATILE` |
| **SECURITY DEFINER** | `false` |
| **行为摘要** | `purchase_orders (user_id, request_id)` 抢占订单；校验用户与 `shop_products`；按货币扣 `balance`/`stars`；按 `product_type` 发放 `user_cases` 或 `user_items`；更新订单成功与资产快照。`p_quantity` 须在 `1..100`，否则 `RAISE EXCEPTION`（SQLSTATE: `P0004`）。 |

> **错误码说明**：
> - `P0001` - 余额不足 (Insufficient balance)
> - `P0002` - Star 不足 (Insufficient stars)
> - `P0003` - 商品不存在或未激活 (Product not found or inactive)
> - `P0004` - 数量无效 (Invalid quantity)
> - `P0005` - 用户不存在 (User not found)
> - `P0006` - 无效总价 (Invalid total price)
> - `P0007` - 不支持的货币 (Unsupported currency)
> - `P0008` - 不支持的商品类型 (Unsupported product_type)

**源定义：**

```sql
CREATE OR REPLACE FUNCTION public.shop_purchase(p_user_id uuid, p_product_id uuid, p_quantity integer, p_request_id uuid)
 RETURNS json
 LANGUAGE plpgsql
AS $function$
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
$function$
```

---

## 4. `public` — 触发器函数（非 `rpc`）

### 4.1 `set_updated_at`

| 属性 | 值 |
|------|-----|
| **返回类型** | `trigger` |
| **语言** | `plpgsql` |
| **Volatile** | `VOLATILE` |
| **SECURITY DEFINER** | `false` |
| **用途** | `BEFORE UPDATE` 时常用：将 `NEW.updated_at` 设为 `now()`。 |

**源定义：**

```sql
CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
```

---

### 4.2 `tg_invite_rewards_guard`

| 属性 | 值 |
|------|-----|
| **返回类型** | `trigger` |
| **语言** | `plpgsql` |
| **SECURITY DEFINER** | `false` |
| **用途** | 插入 `invite_rewards` 前：校验 `invitation_id` 对应邀请存在且 `qualified`，并同步冗余 `inviter_user_id` / `invitee_user_id`；若被邀请人在邀请时已玩过则拒绝。 |

**源定义：**

```sql
CREATE OR REPLACE FUNCTION public.tg_invite_rewards_guard()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  inv record;
begin
  select ui.id,
         ui.status,
         ui.inviter_user_id,
         ui.invitee_user_id,
         ui.invitee_games_played_at_invite
    into inv
  from public.user_invites ui
  where ui.id = new.invitation_id;

  if inv.id is null then
    raise exception 'invitation_id not found';
  end if;

  -- 保证冗余字段一致，避免写入脏数据
  new.inviter_user_id := inv.inviter_user_id;
  new.invitee_user_id := inv.invitee_user_id;

  if inv.status <> 'qualified' then
    raise exception 'Invitation not qualified: cannot grant reward';
  end if;

  if inv.invitee_games_played_at_invite > 0 then
    raise exception 'Invitee already played before invite: reward forbidden';
  end if;

  return new;
end;
$function$
```

---

### 4.3 `tg_invite_rewards_update_guard`

| 属性 | 值 |
|------|-----|
| **返回类型** | `trigger` |
| **语言** | `plpgsql` |
| **SECURITY DEFINER** | `false` |
| **用途** | 更新 `invite_rewards`：关键外键与 `created_at` 不可变；`status` 与 `granted_at` 一致性。 |

**源定义：**

```sql
CREATE OR REPLACE FUNCTION public.tg_invite_rewards_update_guard()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if new.invitation_id <> old.invitation_id then
    raise exception 'invitation_id is immutable';
  end if;
  if new.inviter_user_id <> old.inviter_user_id then
    raise exception 'inviter_user_id is immutable';
  end if;
  if new.invitee_user_id <> old.invitee_user_id then
    raise exception 'invitee_user_id is immutable';
  end if;
  if new.created_at <> old.created_at then
    raise exception 'created_at is immutable';
  end if;

  -- granted_at 与 status 一致性
  if new.status = 'granted' and new.granted_at is null then
    new.granted_at := now();
  end if;
  if new.status <> 'granted' then
    new.granted_at := null;
  end if;

  return new;
end;
$function$
```

---

### 4.4 `tg_user_invites_set_snapshots_and_guard`

| 属性 | 值 |
|------|-----|
| **返回类型** | `trigger` |
| **语言** | `plpgsql` |
| **SECURITY DEFINER** | `false` |
| **用途** | 插入 `user_invites`：从 `users` 填充 telegram 快照与 `invitee_games_played_at_invite`；若被邀请人已玩过则强制 `rejected`。 |

**源定义：**

```sql
CREATE OR REPLACE FUNCTION public.tg_user_invites_set_snapshots_and_guard()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  inviter_tg_id bigint;
  invitee_tg_id bigint;
  invitee_games_played bigint;
begin
  -- 锁定用户行，避免并发下快照不一致
  select u.telegram_id into inviter_tg_id
  from public.users u
  where u.id = new.inviter_user_id
  for share;

  select u.telegram_id, coalesce(u.games_played, 0) into invitee_tg_id, invitee_games_played
  from public.users u
  where u.id = new.invitee_user_id
  for share;

  if inviter_tg_id is null or invitee_tg_id is null then
    raise exception 'Invalid inviter/invitee: users not found';
  end if;

  new.inviter_telegram_id := inviter_tg_id;
  new.invitee_telegram_id := invitee_tg_id;
  new.invitee_games_played_at_invite := invitee_games_played;

  -- 强约束：如果被邀请人当时已经玩过（games_played > 0），则邀请永远不应进入 qualified
  if invitee_games_played > 0 then
    new.status := 'rejected';
    new.qualified_at := null;
  end if;

  return new;
end;
$function$
```

---

### 4.5 `tg_user_invites_update_guard`

| 属性 | 值 |
|------|-----|
| **返回类型** | `trigger` |
| **语言** | `plpgsql` |
| **SECURITY DEFINER** | `false` |
| **用途** | 更新 `user_invites`：关系与快照字段不可变；`rejected` 不可回退；维护 `qualified` 与 `qualified_at` 一致。 |

**源定义：**

```sql
CREATE OR REPLACE FUNCTION public.tg_user_invites_update_guard()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  -- 关系不可变
  if new.inviter_user_id <> old.inviter_user_id then
    raise exception 'inviter_user_id is immutable';
  end if;
  if new.invitee_user_id <> old.invitee_user_id then
    raise exception 'invitee_user_id is immutable';
  end if;

  -- 快照不可变（否则可绕过发奖校验）
  if new.inviter_telegram_id <> old.inviter_telegram_id then
    raise exception 'inviter_telegram_id snapshot is immutable';
  end if;
  if new.invitee_telegram_id <> old.invitee_telegram_id then
    raise exception 'invitee_telegram_id snapshot is immutable';
  end if;
  if new.invitee_games_played_at_invite <> old.invitee_games_played_at_invite then
    raise exception 'invitee_games_played_at_invite snapshot is immutable';
  end if;

  -- 老用户邀请永远不能 qualified
  if old.invitee_games_played_at_invite > 0 and new.status = 'qualified' then
    raise exception 'Invitee already played before invite: cannot qualify';
  end if;

  -- 状态流转约束：rejected 不能被改回 pending/qualified
  if old.status = 'rejected' and new.status <> 'rejected' then
    raise exception 'Rejected invitation is immutable';
  end if;

  -- 维护 qualified_at 一致性
  if new.status = 'qualified' and new.qualified_at is null then
    new.qualified_at := now();
  end if;
  if new.status <> 'qualified' then
    new.qualified_at := null;
  end if;

  return new;
end;
$function$
```

---

## 5. 索引表（按名称）

| Schema | 函数名 | 返回类型 | 客户端 RPC |
|--------|--------|----------|------------|
| `graphql_public` | `graphql` | `jsonb` | 视项目 GraphQL 配置 |
| `public` | `accept_invite_and_reward` | `json` | 是 |
| `public` | `check_and_increment_rate_limit` | `jsonb` | 是 |
| `public` | `cleanup_expired_rate_limits` | `void` | 是 |
| `public` | `execute_asset_transaction` | `json` | 是 |
| `public` | `open_chest_secure` | `json` | 是 |
| `public` | `shop_purchase` | `json` | 是 |
| `public` | `set_updated_at` | `trigger` | **否** |
| `public` | `tg_invite_rewards_guard` | `trigger` | **否** |
| `public` | `tg_invite_rewards_update_guard` | `trigger` | **否** |
| `public` | `tg_user_invites_set_snapshots_and_guard` | `trigger` | **否** |
| `public` | `tg_user_invites_update_guard` | `trigger` | **否** |

**合计：** `graphql_public` 1 个 + `public` 11 个 = **12** 个函数。
