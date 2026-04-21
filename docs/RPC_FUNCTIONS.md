# Supabase 数据库 RPC / 函数参考

本文档描述 **`public`** 与 **`graphql_public`** schema 下的 PostgreSQL 函数（含可通过 PostgREST / `supabase.rpc()` 调用的业务函数，以及仅用于触发器的函数）。

| 项目 | 说明 |
|------|------|
| **数据来源** | Supabase MCP `execute_sql`：`pg_proc`、`pg_get_function_identity_arguments`、`pg_get_functiondef` |
| **远程项目** | `reactTest`（`project_id`: `tfgzxvabdlnkpbikgcjv`） |
| **同步时间** | 2026-04-21（`pg_get_functiondef` 与 Supabase MCP `list_tables` / `execute_sql` 只读核对；`open_chest_secure` / `open_chest_batch_secure` 为库内加权随机，无 `p_item_id` / `p_item_ids`） |
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
  p_request_id: '...',
});
```

批量开箱（`p_request_ids` 长度须与 `p_times` 一致；`p_delta` 可省略，默认为 `1`）：

```ts
await supabase.rpc('open_chest_batch_secure', {
  p_user_id: '...',
  p_chest_id: '...',
  p_price: 100,
  p_request_ids: [/* uuid[], len = p_times */],
  p_times: 3,
});

await supabase.rpc('check_and_increment_rate_limit', {
  p_scope: 'ip:1.2.3.4',
  p_route: '/api/chest/open-batch',
  p_limit: 60,
  p_window_seconds: 60,
  p_delta: 1,
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
| **身份参数** | `p_scope text, p_route text, p_limit integer, p_window_seconds integer, p_delta integer` |
| **默认参数** | `p_delta` 默认 `1` |
| **返回类型** | `jsonb` |
| **语言** | `plpgsql` |
| **Volatile** | `VOLATILE` |
| **SECURITY DEFINER** | **`true`** |
| **search_path** | `SET search_path TO 'public'` |
| **行为摘要** | 时间窗口对齐到整秒切片；对 `api_rate_limits` 做 `INSERT ... ON CONFLICT` 按 `p_delta` 累加计数；`p_limit <= 0`、`p_window_seconds <= 0` 或 `p_delta <= 0` 时 `RAISE EXCEPTION`。 |

**源定义：**

```sql
CREATE OR REPLACE FUNCTION public.check_and_increment_rate_limit(p_scope text, p_route text, p_limit integer, p_window_seconds integer, p_delta integer DEFAULT 1)
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
| **身份参数** | `p_user_id uuid, p_chest_id uuid, p_price integer, p_request_id uuid` |
| **返回类型** | `json` |
| **语言** | `plpgsql` |
| **Volatile** | `VOLATILE` |
| **SECURITY DEFINER** | `false` |
| **行为摘要** | `chest_open_events (user_id, request_id)` 幂等抢占；在 `case_items` 上按 `drop_chance` 做库内加权随机（累积权重 + `random()` 的标准加权抽样）；扣余额与 `user_cases`；发放/合并 `user_items`；写回事件中的前后资产与箱数；重复请求返回已存结果。失败时 `RAISE EXCEPTION`（如余额不足、无箱、无掉落配置、用户不存在）。 |

> **PostgREST / 重载**：若同时存在多个 `open_chest_secure` 重载，PostgREST 可能对 JSON 参数报 **PGRST203**。远程当前**仅保留本四参数签名**（`p_price integer`，无客户端传入的 `p_item_id`）。`supabase.rpc(..., { p_price: number })` 与此匹配。

**源定义**（与远程 `pg_get_functiondef` 一致）：

```sql
CREATE OR REPLACE FUNCTION public.open_chest_secure(p_user_id uuid, p_chest_id uuid, p_price integer, p_request_id uuid)
 RETURNS json
 LANGUAGE plpgsql
AS $function$
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
$function$
```

---

### 3.6 `open_chest_batch_secure`

| 属性 | 值 |
|------|-----|
| **身份参数** | `p_user_id uuid, p_chest_id uuid, p_price integer, p_request_ids uuid[], p_times integer` |
| **返回类型** | `json` |
| **语言** | `plpgsql` |
| **Volatile** | `VOLATILE` |
| **SECURITY DEFINER** | `false` |
| **行为摘要** | 单事务内连续开箱 `p_times` 次（1–10）：`p_request_ids` 长度须与 `p_times` 一致；每次在 `case_items` 上库内加权随机抽 `item_id`；并支持“本批内尽量不重复掉落”（当本批已抽到的种类数 < 掉落池大小时，优先对未抽中过的 `item_id` 加权抽样；否则恢复为池内全量有放回抽样）；按 `chest_open_events (user_id, request_id)` 幂等抢占；已存在的 `request_id` 不重复扣费并返回历史 `item_id`；否则扣 `p_price`、减箱、发放 `user_items` 并写事件快照。失败时 `RAISE EXCEPTION`（余额不足、箱数不足、参数非法、无掉落配置等）。 |

**源定义**（与远程 `pg_get_functiondef` 一致）：

```sql
CREATE OR REPLACE FUNCTION public.open_chest_batch_secure(p_user_id uuid, p_chest_id uuid, p_price integer, p_request_ids uuid[], p_times integer)
 RETURNS json
 LANGUAGE plpgsql
AS $function$
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

  SELECT count(*)::integer INTO v_pool_count
  FROM case_items
  WHERE case_id = p_chest_id AND drop_chance > 0;

  IF v_pool_count IS NULL OR v_pool_count <= 0 THEN
    RAISE EXCEPTION 'No items configured for this chest';
  END IF;

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
$function$
```

---

### 3.7 `shop_purchase`

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
    RAISE EXCEPTION 'Invalid quantity' USING ERRCODE = 'P0004';
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
$function$
```

---

### 3.8 `request_mint_nft_secure`

| 属性 | 值 |
|------|-----|
| **身份参数** | `p_user_id uuid, p_user_item_id uuid, p_wallet_id uuid, p_request_id uuid, p_payload_boc text, p_payload_hash text, p_admin_signature text, p_ipfs_metadata_uri text, p_collection_id uuid, p_expires_at timestamp with time zone` |
| **返回类型** | `json` |
| **语言** | `plpgsql` |
| **Volatile** | `VOLATILE` |
| **SECURITY DEFINER** | `false` |
| **行为摘要** | NFT 铸造请求「签名入库」RPC：锁定 `users`/`user_items`/`user_ton_wallets`/`nft_collections` 行，校验归属与 mintable 开关；幂等插入 `nft_mint_requests (user_id, request_id)`；将 `user_items.locked_for_mint + 1`；把 payload/签名回填并置为 `signed`；返回前端需要的 `collection_address/payload_boc/admin_signature/expires_at`。 |

**源定义：**

```sql
CREATE OR REPLACE FUNCTION public.request_mint_nft_secure(p_user_id uuid, p_user_item_id uuid, p_wallet_id uuid, p_request_id uuid, p_payload_boc text, p_payload_hash text, p_admin_signature text, p_ipfs_metadata_uri text, p_collection_id uuid, p_expires_at timestamp with time zone)
 RETURNS json
 LANGUAGE plpgsql
AS $function$
declare
  v_claimed_id uuid;
  v_existing record;

  v_user_telegram_id bigint;

  v_user_item_user_id uuid;
  v_item_id uuid;
  v_quantity int;
  v_locked_for_mint int;

  v_item_is_mintable boolean;

  v_meta_collection_id uuid;
  v_meta_ipfs_metadata_uri text;
  v_meta_is_mintable boolean;

  v_wallet_user_id uuid;
  v_wallet_address text;
  v_wallet_unbound_at timestamptz;

  v_collection_address text;
  v_collection_is_active boolean;

  v_inflight_exists boolean;
begin
  -- 读取用户 telegram_id（用于审计快照）
  select u.telegram_id
    into v_user_telegram_id
  from public.users u
  where u.id = p_user_id
  for update;

  if v_user_telegram_id is null then
    raise exception 'User not found';
  end if;

  -- 3) 锁定 user_items 行并校验归属与库存
  select ui.user_id, ui.item_id, ui.quantity, ui.locked_for_mint
    into v_user_item_user_id, v_item_id, v_quantity, v_locked_for_mint
  from public.user_items ui
  where ui.id = p_user_item_id
  for update;

  if v_user_item_user_id is null then
    raise exception 'user_item not found';
  end if;

  if v_user_item_user_id <> p_user_id then
    raise exception 'user_item does not belong to user';
  end if;

  if (v_quantity - v_locked_for_mint) < 1 then
    raise exception 'not enough available quantity to mint';
  end if;

  -- 4) 校验 items / item_nft_metadata 可铸造开关
  select i.is_mintable
    into v_item_is_mintable
  from public.items i
  where i.id = v_item_id;

  if coalesce(v_item_is_mintable, false) is distinct from true then
    raise exception 'item is not mintable';
  end if;

  select m.collection_id, m.ipfs_metadata_uri, m.is_mintable
    into v_meta_collection_id, v_meta_ipfs_metadata_uri, v_meta_is_mintable
  from public.item_nft_metadata m
  where m.item_id = v_item_id;

  if v_meta_collection_id is null then
    raise exception 'item nft metadata not found';
  end if;

  if coalesce(v_meta_is_mintable, false) is distinct from true then
    raise exception 'item nft metadata is not mintable';
  end if;

  if v_meta_collection_id <> p_collection_id then
    raise exception 'collection_id does not match item metadata';
  end if;

  if v_meta_ipfs_metadata_uri <> p_ipfs_metadata_uri then
    raise exception 'ipfs_metadata_uri does not match item metadata';
  end if;

  -- 5) 校验钱包未解绑且归属一致
  select w.user_id, w.wallet_address, w.unbound_at
    into v_wallet_user_id, v_wallet_address, v_wallet_unbound_at
  from public.user_ton_wallets w
  where w.id = p_wallet_id
  for update;

  if v_wallet_user_id is null then
    raise exception 'wallet not found';
  end if;

  if v_wallet_user_id <> p_user_id then
    raise exception 'wallet does not belong to user';
  end if;

  if v_wallet_unbound_at is not null then
    raise exception 'wallet is unbound';
  end if;

  -- 6) 校验集合启用
  select c.collection_address, c.is_active
    into v_collection_address, v_collection_is_active
  from public.nft_collections c
  where c.id = p_collection_id
  for update;

  if v_collection_address is null then
    raise exception 'collection not found';
  end if;

  if coalesce(v_collection_is_active, false) is distinct from true then
    raise exception 'collection is not active';
  end if;

  -- 1) 幂等抢占：插入 pending
  insert into public.nft_mint_requests (
    user_id,
    telegram_id,
    user_item_id,
    item_id,
    wallet_id,
    wallet_address,
    collection_id,
    collection_address,
    ipfs_metadata_uri,
    request_id,
    status,
    expires_at
  )
  values (
    p_user_id,
    v_user_telegram_id,
    p_user_item_id,
    v_item_id,
    p_wallet_id,
    v_wallet_address,
    p_collection_id,
    v_collection_address,
    p_ipfs_metadata_uri,
    p_request_id,
    'pending',
    p_expires_at
  )
  on conflict (user_id, request_id) do nothing
  returning id into v_claimed_id;

  -- 2) 命中幂等：直接返回现有记录
  if v_claimed_id is null then
    select collection_address, mint_payload_boc, admin_signature, expires_at
      into v_existing
    from public.nft_mint_requests
    where user_id = p_user_id and request_id = p_request_id
    for update;

    return json_build_object(
      'collection_address', v_existing.collection_address,
      'payload_boc', v_existing.mint_payload_boc,
      'admin_signature', v_existing.admin_signature,
      'expires_at', v_existing.expires_at
    );
  end if;

  -- 7) 显式拒绝：同一 user_item_id 不允许存在进行中请求（排除当前 claimed）
  select exists (
    select 1
    from public.nft_mint_requests r
    where r.user_item_id = p_user_item_id
      and r.status = any (array['pending','signed','broadcasted'])
      and r.id <> v_claimed_id
  ) into v_inflight_exists;

  if v_inflight_exists then
    raise exception 'mint request already in progress for this user_item_id';
  end if;

  -- 8) 锁定库存（locked_for_mint + 1）
  update public.user_items
  set locked_for_mint = locked_for_mint + 1,
      updated_at = now()
  where id = p_user_item_id;

  -- 9) 回填请求记录并置为 signed
  update public.nft_mint_requests
  set
    status = 'signed',
    mint_payload_boc = p_payload_boc,
    payload_hash = p_payload_hash,
    admin_signature = p_admin_signature,
    expires_at = p_expires_at,
    updated_at = now()
  where id = v_claimed_id;

  -- 10) 返回前端所需数据
  return json_build_object(
    'collection_address', v_collection_address,
    'payload_boc', p_payload_boc,
    'admin_signature', p_admin_signature,
    'expires_at', p_expires_at
  );
end;
$function$
```

---

### 3.9 `expire_stale_mint_requests`

| 属性 | 值 |
|------|-----|
| **身份参数** | （无） |
| **返回类型** | `TABLE(expired_request_id uuid, req_user_item_id uuid)` |
| **语言** | `plpgsql` |
| **Volatile** | `VOLATILE` |
| **SECURITY DEFINER** | **`true`** |
| **search_path** | `SET search_path TO 'public', 'pg_temp'` |
| **行为摘要** | 扫描 `nft_mint_requests` 中超时且仍在进行中的请求（`pending/signed/broadcasted` 且 `expires_at < now()`），将其置为 `expired` 并释放 `user_items.locked_for_mint`；对请求行使用 `FOR UPDATE ... SKIP LOCKED` 以支持并发清理。 |

**源定义：**

```sql
CREATE OR REPLACE FUNCTION public.expire_stale_mint_requests()
 RETURNS TABLE(expired_request_id uuid, req_user_item_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  r record;
  v_new_locked int;
begin
  for r in
    select nmr.id, nmr.user_item_id as req_user_item_id
    from public.nft_mint_requests as nmr
    where nmr.status in ('pending','signed','broadcasted')
      and nmr.expires_at < now()
    order by nmr.expires_at asc
    for update of nmr skip locked
  loop
    update public.nft_mint_requests
    set
      status = 'expired',
      failure_reason = 'timeout',
      updated_at = now()
    where id = r.id
      and status in ('pending','signed','broadcasted');

    if not found then
      continue;
    end if;

    update public.user_items ui
    set locked_for_mint = ui.locked_for_mint - 1
    where ui.id = r.req_user_item_id
    returning locked_for_mint into v_new_locked;

    if v_new_locked is null then
      raise exception 'user_item_not_found: %', r.req_user_item_id;
    end if;

    if v_new_locked < 0 then
      raise exception 'user_item_locked_for_mint_negative: %', r.req_user_item_id;
    end if;

    expired_request_id := r.id;
    req_user_item_id := r.req_user_item_id;
    return next;
  end loop;
end;
$function$
```

---

### 3.10 `confirm_mint_nft_secure`

| 属性 | 值 |
|------|-----|
| **身份参数** | `p_mint_request_id uuid, p_tx_hash text, p_nft_item_address text, p_owner_address text, p_exit_code integer, p_chain_event_id uuid` |
| **返回类型** | `TABLE(success boolean, nft_item_address text)` |
| **语言** | `plpgsql` |
| **Volatile** | `VOLATILE` |
| **SECURITY DEFINER** | **`true`** |
| **search_path** | `SET search_path TO 'public', 'pg_temp'` |
| **行为摘要** | 铸造结算 RPC：锁定 `nft_mint_requests` 并按 `exit_code` 走成功/失败路径；失败会释放 `user_items.locked_for_mint`；成功会扣减 `user_items.quantity` 与 `locked_for_mint` 并插入 `user_item_nfts`；同时将 `nft_chain_events` 标记为已处理，避免重复消费；对已成功的请求幂等返回。 |

**源定义：**

```sql
CREATE OR REPLACE FUNCTION public.confirm_mint_nft_secure(p_mint_request_id uuid, p_tx_hash text, p_nft_item_address text, p_owner_address text, p_exit_code integer, p_chain_event_id uuid)
 RETURNS TABLE(success boolean, nft_item_address text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_req public.nft_mint_requests%rowtype;
  v_user_item public.user_items%rowtype;
  v_failure_reason text;
begin
  -- 1) 锁定请求行（幂等 / 并发安全）
  select * into v_req
  from public.nft_mint_requests
  where id = p_mint_request_id
  for update;

  if not found then
    raise exception 'mint_request_not_found: %', p_mint_request_id;
  end if;

  -- 已成功：直接幂等返回
  if v_req.status = 'succeeded' then
    success := true;
    nft_item_address := v_req.nft_item_address;
    return next;
    return;
  end if;

  -- 2) 失败路径：exit_code != 0
  if coalesce(p_exit_code, 0) <> 0 then
    v_failure_reason := 'chain_exit_code=' || p_exit_code::text;

    update public.nft_mint_requests
    set
      status = 'failed',
      failure_reason = v_failure_reason,
      confirmed_tx_hash = p_tx_hash,
      confirmed_at = now(),
      updated_at = now()
    where id = p_mint_request_id;

    -- 释放锁定数量（如果还锁着）
    update public.user_items ui
    set locked_for_mint = ui.locked_for_mint - 1
    where ui.id = v_req.user_item_id
      and ui.locked_for_mint > 0;

    -- 标记链事件已消费（避免重复处理）
    update public.nft_chain_events
    set processed = true,
        processed_at = now()
    where id = p_chain_event_id;

    success := false;
    nft_item_address := null;
    return next;
    return;
  end if;

  -- 3) 成功路径：允许从 pending/signed/broadcasted/expired 回捞
  if v_req.status not in ('pending', 'signed', 'broadcasted', 'expired') then
    raise exception 'mint_request_invalid_status_for_confirm: %', v_req.status;
  end if;

  update public.nft_mint_requests
  set
    status = 'succeeded',
    confirmed_tx_hash = p_tx_hash,
    nft_item_address = p_nft_item_address,
    confirmed_at = now(),
    updated_at = now()
  where id = p_mint_request_id;

  -- 锁定库存行并结算
  select * into v_user_item
  from public.user_items
  where id = v_req.user_item_id
  for update;

  if not found then
    raise exception 'user_item_not_found: %', v_req.user_item_id;
  end if;

  if v_user_item.quantity < 1 then
    raise exception 'user_item_quantity_insufficient: %', v_req.user_item_id;
  end if;

  if v_user_item.locked_for_mint < 1 then
    raise exception 'user_item_locked_for_mint_insufficient: %', v_req.user_item_id;
  end if;

  update public.user_items
  set
    quantity = quantity - 1,
    locked_for_mint = locked_for_mint - 1
  where id = v_req.user_item_id;

  insert into public.user_item_nfts(
    user_id,
    item_id,
    collection_id,
    mint_request_id,
    nft_item_address,
    owner_address,
    tx_hash,
    ipfs_metadata_uri,
    minted_at
  ) values (
    v_req.user_id,
    v_req.item_id,
    v_req.collection_id,
    v_req.id,
    p_nft_item_address,
    p_owner_address,
    p_tx_hash,
    v_req.ipfs_metadata_uri,
    now()
  ) on conflict (mint_request_id) do nothing;

  update public.nft_chain_events
  set processed = true,
      processed_at = now()
  where id = p_chain_event_id;

  success := true;
  nft_item_address := p_nft_item_address;
  return next;
end;
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

### 4.6 `item_nft_metadata_immutability_guard`

| 属性 | 值 |
|------|-----|
| **返回类型** | `trigger` |
| **语言** | `plpgsql` |
| **Volatile** | `VOLATILE` |
| **SECURITY DEFINER** | `false` |
| **用途** | 更新 `item_nft_metadata`：约束 `item_id` / `collection_id` / `ipfs_metadata_uri` 等关键字段不可变，避免被更新成不一致的 NFT 元数据映射。 |

**源定义：**

```sql
CREATE OR REPLACE FUNCTION public.item_nft_metadata_immutability_guard()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.item_id IS DISTINCT FROM OLD.item_id THEN
    RAISE EXCEPTION 'item_id is immutable';
  END IF;
  IF NEW.collection_id IS DISTINCT FROM OLD.collection_id THEN
    RAISE EXCEPTION 'collection_id is immutable';
  END IF;
  IF NEW.ipfs_metadata_uri IS DISTINCT FROM OLD.ipfs_metadata_uri THEN
    RAISE EXCEPTION 'ipfs_metadata_uri is immutable';
  END IF;

  RETURN NEW;
END;
$function$
```

---

### 4.7 `nft_mint_requests_update_guard`

| 属性 | 值 |
|------|-----|
| **返回类型** | `trigger` |
| **语言** | `plpgsql` |
| **Volatile** | `VOLATILE` |
| **SECURITY DEFINER** | `false` |
| **用途** | 更新 `nft_mint_requests`：限制关键字段不可变（`request_id/user_item_id/collection_address/ipfs_metadata_uri`）；并约束 `status` 只能向前流转（允许 `expired → succeeded` 作为链上回捞例外），终态不可随意回退或修改。 |

**源定义：**

```sql
CREATE OR REPLACE FUNCTION public.nft_mint_requests_update_guard()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  old_rank int;
  new_rank int;
BEGIN
  -- 不可变字段（创建后定版）
  IF NEW.request_id IS DISTINCT FROM OLD.request_id THEN
    RAISE EXCEPTION 'request_id is immutable';
  END IF;
  IF NEW.user_item_id IS DISTINCT FROM OLD.user_item_id THEN
    RAISE EXCEPTION 'user_item_id is immutable';
  END IF;
  IF NEW.collection_address IS DISTINCT FROM OLD.collection_address THEN
    RAISE EXCEPTION 'collection_address is immutable';
  END IF;
  IF NEW.ipfs_metadata_uri IS DISTINCT FROM OLD.ipfs_metadata_uri THEN
    RAISE EXCEPTION 'ipfs_metadata_uri is immutable';
  END IF;

  -- status 只能向前流转（允许 expired -> succeeded 作为链上回捞例外）
  old_rank := CASE OLD.status
    WHEN 'pending' THEN 10
    WHEN 'signed' THEN 20
    WHEN 'broadcasted' THEN 30
    WHEN 'succeeded' THEN 40
    WHEN 'failed' THEN 40
    WHEN 'expired' THEN 40
    ELSE 0
  END;

  new_rank := CASE NEW.status
    WHEN 'pending' THEN 10
    WHEN 'signed' THEN 20
    WHEN 'broadcasted' THEN 30
    WHEN 'succeeded' THEN 40
    WHEN 'failed' THEN 40
    WHEN 'expired' THEN 40
    ELSE 0
  END;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF (OLD.status = 'expired' AND NEW.status = 'succeeded') THEN
      -- 允许回捞
      RETURN NEW;
    END IF;

    IF new_rank < old_rank THEN
      RAISE EXCEPTION 'status can only move forward';
    END IF;

    -- 终态不允许变更（除 expired -> succeeded）
    IF OLD.status IN ('succeeded', 'failed') THEN
      RAISE EXCEPTION 'terminal status is immutable';
    END IF;

    IF OLD.status = 'expired' AND NEW.status <> 'expired' THEN
      RAISE EXCEPTION 'expired can only be recovered to succeeded';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$
```

---

### 4.8 `user_item_nfts_immutability_guard`

| 属性 | 值 |
|------|-----|
| **返回类型** | `trigger` |
| **语言** | `plpgsql` |
| **Volatile** | `VOLATILE` |
| **SECURITY DEFINER** | `false` |
| **用途** | 更新 `user_item_nfts`：约束 `nft_item_address/mint_request_id/item_id` 等关键字段不可变，避免链上资产指向被篡改。 |

**源定义：**

```sql
CREATE OR REPLACE FUNCTION public.user_item_nfts_immutability_guard()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.nft_item_address IS DISTINCT FROM OLD.nft_item_address THEN
    RAISE EXCEPTION 'nft_item_address is immutable';
  END IF;
  IF NEW.mint_request_id IS DISTINCT FROM OLD.mint_request_id THEN
    RAISE EXCEPTION 'mint_request_id is immutable';
  END IF;
  IF NEW.item_id IS DISTINCT FROM OLD.item_id THEN
    RAISE EXCEPTION 'item_id is immutable';
  END IF;

  RETURN NEW;
END;
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
| `public` | `confirm_mint_nft_secure` | `TABLE(success boolean, nft_item_address text)` | 是（建议仅服务端） |
| `public` | `execute_asset_transaction` | `json` | 是 |
| `public` | `expire_stale_mint_requests` | `TABLE(expired_request_id uuid, req_user_item_id uuid)` | 是（建议仅服务端/定时任务） |
| `public` | `open_chest_secure` | `json` | 是 |
| `public` | `open_chest_batch_secure` | `json` | 是 |
| `public` | `request_mint_nft_secure` | `json` | 是（建议仅服务端） |
| `public` | `shop_purchase` | `json` | 是 |
| `public` | `item_nft_metadata_immutability_guard` | `trigger` | **否** |
| `public` | `nft_mint_requests_update_guard` | `trigger` | **否** |
| `public` | `set_updated_at` | `trigger` | **否** |
| `public` | `tg_invite_rewards_guard` | `trigger` | **否** |
| `public` | `tg_invite_rewards_update_guard` | `trigger` | **否** |
| `public` | `tg_user_invites_set_snapshots_and_guard` | `trigger` | **否** |
| `public` | `tg_user_invites_update_guard` | `trigger` | **否** |
| `public` | `user_item_nfts_immutability_guard` | `trigger` | **否** |

**合计：** `graphql_public` 1 个 + `public` 18 个 = **19** 个函数。
