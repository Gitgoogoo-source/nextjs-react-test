# 数据库表清单与表结构（Supabase Postgres）

> 说明：本文件由 Supabase MCP **`list_tables`（verbose）只读查询**与 `information_schema` / `pg_stat_all_tables` 抽样核对生成，不包含任何写入/修改操作。
> 
> 同步时间：2026-04-21  
> 项目：`reactTest`（project_id: `tfgzxvabdlnkpbikgcjv`）

列说明：`类型` 为 Postgres `data_type`；`格式` 为 Supabase 返回的 `format`；`属性` 含 nullable / unique / generated 等；`默认值/检查/备注` 来自数据库元数据。

**相关文档**：[Supabase RPC / 函数参考（`public` + `graphql_public`）](./RPC_FUNCTIONS.md)

**场景说明**：每张表标题下的「场景说明」为根据本仓库业务（Telegram Mini App 小游戏、开箱/商店/邀请等）与 Supabase 平台能力归纳的用途说明，便于读文档时对齐产品场景；**不是**数据库 `COMMENT` 字段的自动导出（若与线上实际用法不一致，以代码与 RPC 为准）。

**补充包含（远程只读导出）**：为便于排查幂等/并发与数据一致性问题，本文件已额外补充以下元数据（来自 `pg_catalog` / `information_schema` 的只读 SQL 导出）：

- **RLS policies**：`pg_policies`（仅导出策略正文，不做权限推断）
- **Indexes**：`pg_indexes`（含 partial index 的 `WHERE` 条件）
- **PK / UNIQUE 约束**：`pg_constraint`（仅 `PRIMARY KEY` 与 `UNIQUE`）
- **Triggers → Functions 绑定关系**：`pg_trigger` / `pg_proc`（含 trigger 定义与所调用函数）

> 重要提示：很多表虽然显示 “RLS: 开启”，但如果 **没有任何 policy**，则对 `anon` / `authenticated` 等角色默认 **不可见/不可写**；本项目的服务端使用 Service Role 会绕过 RLS，因此仍需在应用层按 `telegram_id/user_id` 做强过滤。

## 目录

### public

- [public.users](#publicusers)
- [public.leaderboard](#publicleaderboard)
- [public.items](#publicitems)
- [public.cases](#publiccases)
- [public.case_items](#publiccase_items)
- [public.user_cases](#publicuser_cases)
- [public.user_items](#publicuser_items)
- [public.resource_transactions](#publicresource_transactions)
- [public.chest_open_events](#publicchest_open_events)
- [public.shop_products](#publicshop_products)
- [public.purchase_orders](#publicpurchase_orders)
- [public.user_invites](#publicuser_invites)
- [public.invite_rewards](#publicinvite_rewards)
- [public.user_prepared_messages](#publicuser_prepared_messages)
- [public.api_rate_limits](#publicapi_rate_limits)
- [public.user_ton_wallets](#publicuser_ton_wallets)
- [public.nft_collections](#publicnft_collections)
- [public.item_nft_metadata](#publicitem_nft_metadata)
- [public.nft_mint_requests](#publicnft_mint_requests)
- [public.user_item_nfts](#publicuser_item_nfts)
- [public.nft_chain_events](#publicnft_chain_events)

### auth

- [auth.audit_log_entries](#authaudit_log_entries)
- [auth.custom_oauth_providers](#authcustom_oauth_providers)
- [auth.flow_state](#authflow_state)
- [auth.identities](#authidentities)
- [auth.instances](#authinstances)
- [auth.mfa_amr_claims](#authmfa_amr_claims)
- [auth.mfa_challenges](#authmfa_challenges)
- [auth.mfa_factors](#authmfa_factors)
- [auth.oauth_authorizations](#authoauth_authorizations)
- [auth.oauth_client_states](#authoauth_client_states)
- [auth.oauth_clients](#authoauth_clients)
- [auth.oauth_consents](#authoauth_consents)
- [auth.one_time_tokens](#authone_time_tokens)
- [auth.refresh_tokens](#authrefresh_tokens)
- [auth.saml_providers](#authsaml_providers)
- [auth.saml_relay_states](#authsaml_relay_states)
- [auth.schema_migrations](#authschema_migrations)
- [auth.sessions](#authsessions)
- [auth.sso_domains](#authsso_domains)
- [auth.sso_providers](#authsso_providers)
- [auth.users](#authusers)
- [auth.webauthn_challenges](#authwebauthn_challenges)
- [auth.webauthn_credentials](#authwebauthn_credentials)

### storage

- [storage.buckets](#storagebuckets)
- [storage.buckets_analytics](#storagebuckets_analytics)
- [storage.buckets_vectors](#storagebuckets_vectors)
- [storage.migrations](#storagemigrations)
- [storage.objects](#storageobjects)
- [storage.s3_multipart_uploads](#storages3_multipart_uploads)
- [storage.s3_multipart_uploads_parts](#storages3_multipart_uploads_parts)
- [storage.vector_indexes](#storagevector_indexes)

## public.users

**场景说明**：玩家主数据表：以 Telegram 用户为身份，存放资料、游戏分数统计、游戏内货币（balance / stars / dex_tokens 等）。服务端验签后同步或更新用户状态，其它业务表多通过 `user_id` 或 `telegram_id` 逻辑关联。

RLS: 开启 | 估算行数: 2

| 列名 | 类型 | 格式 | 属性 | 默认值 | 检查/枚举 | 列注释 |
| --- | --- | --- | --- | --- | --- | --- |
| `id` | uuid | uuid | — | gen_random_uuid() | — | — |
| `telegram_id` | bigint | int8 | unique | — | — | — |
| `first_name` | text | text | — | — | — | — |
| `last_name` | text | text | nullable | — | — | — |
| `username` | text | text | nullable | — | — | — |
| `avatar_url` | text | text | nullable | — | — | — |
| `total_score` | bigint | int8 | nullable | 0 | — | — |
| `high_score` | bigint | int8 | nullable | 0 | — | — |
| `games_played` | bigint | int8 | nullable | 0 | — | — |
| `balance` | bigint | int8 | — | 0 | CHECK: balance >= 0 | — |
| `created_at` | timestamp with time zone | timestamptz | — | timezone('utc'::text, now()) | — | — |
| `updated_at` | timestamp with time zone | timestamptz | — | timezone('utc'::text, now()) | — | — |
| `stars` | bigint | int8 | nullable | 0 | CHECK: stars >= 0 | 玩家拥有的 Star 数量 |
| `dex_tokens` | numeric | numeric | nullable | 0 | — | 玩家拥有的 DEX 代币数量 |

**主键**：`id`

**外键约束**：

- `invite_rewards_inviter_user_id_fkey`：`public.invite_rewards.inviter_user_id` → `public.users.id`
- `leaderboard_user_id_fkey`：`public.leaderboard.user_id` → `public.users.id`
- `user_cases_user_id_fkey`：`public.user_cases.user_id` → `public.users.id`
- `user_items_user_id_fkey`：`public.user_items.user_id` → `public.users.id`
- `resource_transactions_user_id_fkey`：`public.resource_transactions.user_id` → `public.users.id`
- `chest_open_events_user_id_fkey`：`public.chest_open_events.user_id` → `public.users.id`
- `purchase_orders_user_id_fkey`：`public.purchase_orders.user_id` → `public.users.id`
- `user_invites_inviter_user_id_fkey`：`public.user_invites.inviter_user_id` → `public.users.id`
- `user_invites_invitee_user_id_fkey`：`public.user_invites.invitee_user_id` → `public.users.id`
- `invite_rewards_invitee_user_id_fkey`：`public.invite_rewards.invitee_user_id` → `public.users.id`
- `user_prepared_messages_user_id_fkey`：`public.user_prepared_messages.user_id` → `public.users.id`

---

## public.leaderboard

**场景说明**：排行榜/历史分数记录：每次有效对局或提交产生的分数快照，用于榜单展示或按时间追溯；与 `public.users` 关联。

RLS: 开启 | 估算行数: 0

| 列名 | 类型 | 格式 | 属性 | 默认值 | 检查/枚举 | 列注释 |
| --- | --- | --- | --- | --- | --- | --- |
| `id` | uuid | uuid | — | gen_random_uuid() | — | — |
| `user_id` | uuid | uuid | — | — | — | — |
| `score` | bigint | int8 | — | — | — | — |
| `played_at` | timestamp with time zone | timestamptz | — | timezone('utc'::text, now()) | — | — |

**主键**：`id`

**外键约束**：

- `leaderboard_user_id_fkey`：`public.leaderboard.user_id` → `public.users.id`

---

## public.items

**场景说明**：物品主数据：名称、稀有度与前端展示样式（颜色、边框等）。被开箱掉落、商店直购、邀请奖励等引用，是「道具长什么样」的单一来源。

RLS: 开启 | 估算行数: 5

| 列名 | 类型 | 格式 | 属性 | 默认值 | 检查/枚举 | 列注释 |
| --- | --- | --- | --- | --- | --- | --- |
| `id` | uuid | uuid | — | gen_random_uuid() | — | — |
| `name` | text | text | — | — | — | — |
| `rarity` | text | text | — | — | — | — |
| `color` | text | text | — | — | — | — |
| `border` | text | text | — | — | — | — |
| `hex` | text | text | — | — | — | — |
| `created_at` | timestamp with time zone | timestamptz | — | timezone('utc'::text, now()) | — | — |
| `is_mintable` | boolean | bool | — | false | — | — |
| `mint_gas_estimate_nano_ton` | bigint | int8 | nullable | — | — | — |

**主键**：`id`

**外键约束**：

- `chest_open_events_item_id_fkey`：`public.chest_open_events.item_id` → `public.items.id`
- `shop_products_item_id_fkey`：`public.shop_products.item_id` → `public.items.id`
- `invite_rewards_item_id_fkey`：`public.invite_rewards.item_id` → `public.items.id`
- `case_items_item_id_fkey`：`public.case_items.item_id` → `public.items.id`
- `user_items_item_id_fkey`：`public.user_items.item_id` → `public.items.id`
- `item_nft_metadata_item_id_fkey`：`public.item_nft_metadata.item_id` → `public.items.id`
- `nft_mint_requests_item_id_fkey`：`public.nft_mint_requests.item_id` → `public.items.id`
- `user_item_nfts_item_id_fkey`：`public.user_item_nfts.item_id` → `public.items.id`

---

## public.cases

**场景说明**：箱子（盲盒）定义：展示名、价格、`case_key` 等。与掉落池、用户库存、商店上架、开箱流水关联。

RLS: 开启 | 估算行数: 3

| 列名 | 类型 | 格式 | 属性 | 默认值 | 检查/枚举 | 列注释 |
| --- | --- | --- | --- | --- | --- | --- |
| `name` | text | text | — | — | — | — |
| `price` | bigint | int8 | — | — | CHECK: price >= 0 | — |
| `description` | text | text | nullable | — | — | — |
| `created_at` | timestamp with time zone | timestamptz | — | timezone('utc'::text, now()) | — | — |
| `case_key` | text | text | unique | — | — | — |
| `id` | uuid | uuid | — | gen_random_uuid() | — | — |

**主键**：`id`

**外键约束**：

- `chest_open_events_case_id_fkey`：`public.chest_open_events.case_id` → `public.cases.id`
- `shop_products_case_id_fkey`：`public.shop_products.case_id` → `public.cases.id`
- `case_items_case_id_fkey`：`public.case_items.case_id` → `public.cases.id`
- `user_cases_case_id_fkey`：`public.user_cases.case_id` → `public.cases.id`

---

## public.case_items

**场景说明**：单个箱子内的掉落池：可开出的 `items` 及 `drop_chance`（权重）。RPC `open_chest_secure` / `open_chest_batch_secure` 在库内按 `drop_chance` 做加权随机（累积权重 + `random()` 抽样）；批量开箱额外支持“本批内尽量不重复掉落”（当本批已抽到的种类数 < 掉落池大小时优先抽未出现过的 `item_id`）。

RLS: 开启 | 估算行数: 11

| 列名 | 类型 | 格式 | 属性 | 默认值 | 检查/枚举 | 列注释 |
| --- | --- | --- | --- | --- | --- | --- |
| `id` | uuid | uuid | — | gen_random_uuid() | — | — |
| `item_id` | uuid | uuid | — | — | — | — |
| `drop_chance` | numeric | numeric | — | — | CHECK: drop_chance > 0::numeric AND drop_chance <= 100::numeric | — |
| `created_at` | timestamp with time zone | timestamptz | — | timezone('utc'::text, now()) | — | — |
| `case_id` | uuid | uuid | — | — | — | — |

**主键**：`id`

**外键约束**：

- `case_items_case_id_fkey`：`public.case_items.case_id` → `public.cases.id`
- `case_items_item_id_fkey`：`public.case_items.item_id` → `public.items.id`

---

## public.user_cases

**场景说明**：用户持有的未开箱箱子库存：按用户 + 箱子维度记录数量；开箱或购买入库时更新。

RLS: 开启 | 估算行数: 5

| 列名 | 类型 | 格式 | 属性 | 默认值 | 检查/枚举 | 列注释 |
| --- | --- | --- | --- | --- | --- | --- |
| `id` | uuid | uuid | — | gen_random_uuid() | — | — |
| `user_id` | uuid | uuid | — | — | — | — |
| `quantity` | integer | int4 | — | 0 | CHECK: quantity >= 0 | — |
| `created_at` | timestamp with time zone | timestamptz | — | timezone('utc'::text, now()) | — | — |
| `updated_at` | timestamp with time zone | timestamptz | — | timezone('utc'::text, now()) | — | — |
| `case_id` | uuid | uuid | — | — | — | — |

**主键**：`id`

**外键约束**：

- `user_cases_user_id_fkey`：`public.user_cases.user_id` → `public.users.id`
- `user_cases_case_id_fkey`：`public.user_cases.case_id` → `public.cases.id`

---

## public.user_items

**场景说明**：用户背包/库存：已获得的物品及数量；开箱获得、商店购买、邀请奖励等最终落在此表。

RLS: 开启 | 估算行数: 7

| 列名 | 类型 | 格式 | 属性 | 默认值 | 检查/枚举 | 列注释 |
| --- | --- | --- | --- | --- | --- | --- |
| `id` | uuid | uuid | — | gen_random_uuid() | — | — |
| `user_id` | uuid | uuid | — | — | — | — |
| `item_id` | uuid | uuid | — | — | — | — |
| `quantity` | integer | int4 | — | 1 | CHECK: quantity >= 0 | — |
| `created_at` | timestamp with time zone | timestamptz | nullable | now() | — | — |
| `updated_at` | timestamp with time zone | timestamptz | nullable | now() | — | — |
| `locked_for_mint` | integer | int4 | — | 0 | — | — |

**主键**：`id`

**外键约束**：

- `user_items_user_id_fkey`：`public.user_items.user_id` → `public.users.id`
- `user_items_item_id_fkey`：`public.user_items.item_id` → `public.items.id`
- `nft_mint_requests_user_item_id_fkey`：`public.nft_mint_requests.user_item_id` → `public.user_items.id`

---

## public.resource_transactions

**场景说明**：资源变动流水：如货币、积分类资源的增减及原因字段，用于审计、对账与排查异常扣款。

RLS: 开启 | 估算行数: 0

| 列名 | 类型 | 格式 | 属性 | 默认值 | 检查/枚举 | 列注释 |
| --- | --- | --- | --- | --- | --- | --- |
| `id` | uuid | uuid | — | gen_random_uuid() | — | — |
| `user_id` | uuid | uuid | — | — | — | — |
| `resource_type` | text | text | — | — | — | — |
| `amount` | numeric | numeric | — | — | — | — |
| `reason` | text | text | nullable | — | — | — |
| `created_at` | timestamp with time zone | timestamptz | — | now() | — | — |

**主键**：`id`

**外键约束**：

- `resource_transactions_user_id_fkey`：`public.resource_transactions.user_id` → `public.users.id`

---

## public.chest_open_events

**场景说明**：开箱过程与结果流水：含幂等 `request_id`、扣费前后余额与 stars、箱子数量前后快照等，用于防重复请求、反作弊追溯与客服对账。`item_id` 由 RPC 在数据库内按 `case_items.drop_chance` 加权随机（累积权重 + `random()` 抽样）选出，客户端只传 `p_chest_id` 与 `p_request_id`（批量为 `p_request_ids`）；`p_price` 为 `integer`，写入本表 `price`（`bigint`）时由数据库隐式转换。

RLS: 开启 | 估算行数: 182

| 列名 | 类型 | 格式 | 属性 | 默认值 | 检查/枚举 | 列注释 |
| --- | --- | --- | --- | --- | --- | --- |
| `id` | uuid | uuid | — | gen_random_uuid() | — | — |
| `user_id` | uuid | uuid | nullable | — | — | — |
| `case_id` | uuid | uuid | nullable | — | — | — |
| `request_id` | uuid | uuid | — | — | — | — |
| `item_id` | uuid | uuid | nullable | — | — | — |
| `price` | bigint | int8 | — | — | — | — |
| `balance_before` | bigint | int8 | nullable | — | — | — |
| `balance_after` | bigint | int8 | nullable | — | — | — |
| `stars_before` | bigint | int8 | nullable | — | — | — |
| `stars_after` | bigint | int8 | nullable | — | — | — |
| `case_quantity_before` | integer | int4 | nullable | — | — | — |
| `case_quantity_after` | integer | int4 | nullable | — | — | — |
| `created_at` | timestamp with time zone | timestamptz | nullable | now() | — | — |

**主键**：`id`

**外键约束**：

- `chest_open_events_item_id_fkey`：`public.chest_open_events.item_id` → `public.items.id`
- `chest_open_events_user_id_fkey`：`public.chest_open_events.user_id` → `public.users.id`
- `chest_open_events_case_id_fkey`：`public.chest_open_events.case_id` → `public.cases.id`

---

## public.shop_products

**场景说明**：商店上架商品：可卖「箱子」或「物品」，标价货币（balance / stars）与是否上架；`purchase_orders` 购买时引用。

RLS: 开启 | 估算行数: 3

| 列名 | 类型 | 格式 | 属性 | 默认值 | 检查/枚举 | 列注释 |
| --- | --- | --- | --- | --- | --- | --- |
| `id` | uuid | uuid | — | gen_random_uuid() | — | — |
| `product_type` | text | text | — | — | CHECK: product_type = ANY (ARRAY['case'::text, 'item'::text]) | — |
| `case_id` | uuid | uuid | nullable | — | — | — |
| `item_id` | uuid | uuid | nullable | — | — | — |
| `title` | text | text | — | — | — | — |
| `description` | text | text | nullable | — | — | — |
| `currency` | text | text | — | — | CHECK: currency = ANY (ARRAY['balance'::text, 'stars'::text]) | — |
| `price` | bigint | int8 | — | — | CHECK: price >= 0 | — |
| `is_active` | boolean | bool | — | true | — | — |
| `created_at` | timestamp with time zone | timestamptz | — | now() | — | — |
| `updated_at` | timestamp with time zone | timestamptz | — | now() | — | — |

**主键**：`id`

**外键约束**：

- `purchase_orders_product_id_fkey`：`public.purchase_orders.product_id` → `public.shop_products.id`
- `shop_products_case_id_fkey`：`public.shop_products.case_id` → `public.cases.id`
- `shop_products_item_id_fkey`：`public.shop_products.item_id` → `public.items.id`

---

## public.purchase_orders

**场景说明**：商店购买订单：幂等 `request_id`、订单状态、单价总价及支付前后快照；与 RPC/服务端原子扣款 + 发货流程配合。

RLS: 开启 | 估算行数: 63

| 列名 | 类型 | 格式 | 属性 | 默认值 | 检查/枚举 | 列注释 |
| --- | --- | --- | --- | --- | --- | --- |
| `id` | uuid | uuid | — | gen_random_uuid() | — | — |
| `user_id` | uuid | uuid | — | — | — | — |
| `product_id` | uuid | uuid | — | — | — | — |
| `request_id` | uuid | uuid | — | — | — | — |
| `quantity` | integer | int4 | — | — | CHECK: quantity > 0 AND quantity <= 100 | — |
| `status` | text | text | — | 'pending'::text | CHECK: status = ANY (ARRAY['pending'::text, 'succeeded'::text, 'failed'::text]) | — |
| `currency` | text | text | — | — | CHECK: currency = ANY (ARRAY['balance'::text, 'stars'::text]) | — |
| `unit_price` | bigint | int8 | — | — | CHECK: unit_price >= 0 | — |
| `total_price` | bigint | int8 | — | — | CHECK: total_price >= 0 | — |
| `balance_before` | bigint | int8 | nullable | — | — | — |
| `balance_after` | bigint | int8 | nullable | — | — | — |
| `stars_before` | bigint | int8 | nullable | — | — | — |
| `stars_after` | bigint | int8 | nullable | — | — | — |
| `created_at` | timestamp with time zone | timestamptz | — | now() | — | — |
| `updated_at` | timestamp with time zone | timestamptz | — | now() | — | — |

**主键**：`id`

**外键约束**：

- `purchase_orders_user_id_fkey`：`public.purchase_orders.user_id` → `public.users.id`
- `purchase_orders_product_id_fkey`：`public.purchase_orders.product_id` → `public.shop_products.id`

---

## public.user_invites

**场景说明**：邀请关系：邀请人与被邀请人、邀请码、状态及资格判定（如被邀请人局数）。用于拉新活动与后续奖励触发。

RLS: 关闭 | 估算行数: 0

| 列名 | 类型 | 格式 | 属性 | 默认值 | 检查/枚举 | 列注释 |
| --- | --- | --- | --- | --- | --- | --- |
| `id` | uuid | uuid | — | gen_random_uuid() | — | — |
| `inviter_user_id` | uuid | uuid | — | — | — | — |
| `invitee_user_id` | uuid | uuid | — | — | — | — |
| `inviter_telegram_id` | bigint | int8 | — | — | — | — |
| `invitee_telegram_id` | bigint | int8 | — | — | — | — |
| `invite_code` | text | text | nullable | — | — | — |
| `status` | text | text | — | 'pending'::text | CHECK: status = ANY (ARRAY['pending'::text, 'qualified'::text, 'rejected'::text]) | — |
| `qualified_at` | timestamp with time zone | timestamptz | nullable | — | — | — |
| `created_at` | timestamp with time zone | timestamptz | — | now() | — | — |
| `invitee_games_played_at_invite` | bigint | int8 | — | 0 | CHECK: invitee_games_played_at_invite >= 0 | — |

**主键**：`id`

**外键约束**：

- `invite_rewards_invitation_id_fkey`：`public.invite_rewards.invitation_id` → `public.user_invites.id`
- `user_invites_inviter_user_id_fkey`：`public.user_invites.inviter_user_id` → `public.users.id`
- `user_invites_invitee_user_id_fkey`：`public.user_invites.invitee_user_id` → `public.users.id`

---

## public.invite_rewards

**场景说明**：邀请奖励发放记录：奖励类型（金币/积分/物品）、数量、发放状态与错误信息；与某次邀请绑定，支持幂等与冲正类状态。

RLS: 关闭 | 估算行数: 0

| 列名 | 类型 | 格式 | 属性 | 默认值 | 检查/枚举 | 列注释 |
| --- | --- | --- | --- | --- | --- | --- |
| `id` | uuid | uuid | — | gen_random_uuid() | — | — |
| `invitation_id` | uuid | uuid | — | — | — | — |
| `inviter_user_id` | uuid | uuid | — | — | — | — |
| `invitee_user_id` | uuid | uuid | — | — | — | — |
| `reward_type` | text | text | — | — | CHECK: reward_type = ANY (ARRAY['coins'::text, 'points'::text, 'item'::text]) | — |
| `amount` | bigint | int8 | nullable | — | — | — |
| `item_id` | uuid | uuid | nullable | — | — | — |
| `quantity` | integer | int4 | — | 1 | CHECK: quantity > 0 | — |
| `status` | text | text | — | 'pending'::text | CHECK: status = ANY (ARRAY['pending'::text, 'granted'::text, 'failed'::text, 'reversed'::text]) | — |
| `granted_at` | timestamp with time zone | timestamptz | nullable | — | — | — |
| `error` | text | text | nullable | — | — | — |
| `created_at` | timestamp with time zone | timestamptz | — | now() | — | — |

**主键**：`id`

**外键约束**：

- `invite_rewards_invitee_user_id_fkey`：`public.invite_rewards.invitee_user_id` → `public.users.id`
- `invite_rewards_invitation_id_fkey`：`public.invite_rewards.invitation_id` → `public.user_invites.id`
- `invite_rewards_inviter_user_id_fkey`：`public.invite_rewards.inviter_user_id` → `public.users.id`
- `invite_rewards_item_id_fkey`：`public.invite_rewards.item_id` → `public.items.id`

---

## public.user_prepared_messages

**场景说明**：与 Telegram Bot 发送消息相关的预置记录（如 `kind` + `msg_id`）：用于分享、邀请或客服类消息的幂等/去重或状态跟踪。

RLS: 关闭 | 估算行数: 0

| 列名 | 类型 | 格式 | 属性 | 默认值 | 检查/枚举 | 列注释 |
| --- | --- | --- | --- | --- | --- | --- |
| `id` | uuid | uuid | — | gen_random_uuid() | — | — |
| `user_id` | uuid | uuid | — | — | — | — |
| `kind` | text | text | — | — | — | — |
| `msg_id` | text | text | — | — | — | — |
| `created_at` | timestamp with time zone | timestamptz | — | now() | — | — |
| `updated_at` | timestamp with time zone | timestamptz | — | now() | — | — |

**主键**：`id`

**外键约束**：

- `user_prepared_messages_user_id_fkey`：`public.user_prepared_messages.user_id` → `public.users.id`

---

## public.api_rate_limits

**场景说明**：接口限流计数：按 `scope` + `route` + 时间窗口聚合请求次数，用于防刷、防滥用与保护服务端资源。

RLS: 开启 | 估算行数: 218

| 列名 | 类型 | 格式 | 属性 | 默认值 | 检查/枚举 | 列注释 |
| --- | --- | --- | --- | --- | --- | --- |
| `scope` | text | text | — | — | — | — |
| `route` | text | text | — | — | — | — |
| `window_start` | timestamp with time zone | timestamptz | — | — | — | — |
| `count` | integer | int4 | — | 0 | — | — |
| `updated_at` | timestamp with time zone | timestamptz | — | now() | — | — |

**主键**：`scope`, `route`, `window_start`

---

## public.user_ton_wallets

**场景说明**：用户绑定的 TON 钱包：用于 NFT 铸造/发放时的收款地址与链环境（mainnet/testnet）记录。**注意**：按项目约定，服务端只信任 `wallet_id`，钱包地址 `wallet_address` 在库侧反查，不信任客户端直接传地址。

RLS: 开启 | 估算行数: 0

| 列名 | 类型 | 格式 | 属性 | 默认值 | 检查/枚举 | 列注释 |
| --- | --- | --- | --- | --- | --- | --- |
| `id` | uuid | uuid | — | gen_random_uuid() | — | — |
| `user_id` | uuid | uuid | — | — | — | — |
| `telegram_id` | bigint | int8 | — | — | — | — |
| `wallet_address` | text | text | — | — | CHECK: length(wallet_address) >= 48 AND length(wallet_address) <= 68 AND wallet_address ~ '^[A-Za-z0-9_-]{48,68}$'::text | — |
| `wallet_chain` | text | text | — | 'ton-mainnet'::text | CHECK: wallet_chain = ANY (ARRAY['ton-mainnet'::text, 'ton-testnet'::text]) | — |
| `is_primary` | boolean | bool | — | true | — | — |
| `public_key` | text | text | nullable | — | — | — |
| `first_bound_at` | timestamp with time zone | timestamptz | — | now() | — | — |
| `last_active_at` | timestamp with time zone | timestamptz | — | now() | — | — |
| `unbound_at` | timestamp with time zone | timestamptz | nullable | — | — | — |

**主键**：`id`

**外键约束**：

- `user_ton_wallets_user_id_fkey`：`public.user_ton_wallets.user_id` → `public.users.id`
- `nft_mint_requests_wallet_id_fkey`：`public.nft_mint_requests.wallet_id` → `public.user_ton_wallets.id`

---

## public.nft_collections

**场景说明**：NFT 集合配置：集合地址、名称、版税与铸造权限等。`nft_mint_requests` / `item_nft_metadata` / `user_item_nfts` 引用此表以绑定集合。

RLS: 开启 | 估算行数: 0

| 列名 | 类型 | 格式 | 属性 | 默认值 | 检查/枚举 | 列注释 |
| --- | --- | --- | --- | --- | --- | --- |
| `id` | uuid | uuid | — | gen_random_uuid() | — | — |
| `collection_key` | text | text | unique | — | — | — |
| `collection_address` | text | text | unique | — | — | — |
| `chain` | text | text | — | 'ton-mainnet'::text | CHECK: chain = ANY (ARRAY['ton-mainnet'::text, 'ton-testnet'::text]) | — |
| `name` | text | text | — | — | — | — |
| `description` | text | text | nullable | — | — | — |
| `cover_uri` | text | text | nullable | — | — | — |
| `royalty_basis_points` | integer | int4 | — | 500 | CHECK: royalty_basis_points >= 0 AND royalty_basis_points <= 10000 | — |
| `royalty_address` | text | text | — | — | — | — |
| `mint_authority_address` | text | text | — | — | — | — |
| `is_active` | boolean | bool | — | true | — | — |
| `created_at` | timestamp with time zone | timestamptz | — | now() | — | — |
| `updated_at` | timestamp with time zone | timestamptz | — | now() | — | — |

**主键**：`id`

**外键约束**：

- `item_nft_metadata_collection_id_fkey`：`public.item_nft_metadata.collection_id` → `public.nft_collections.id`
- `nft_mint_requests_collection_id_fkey`：`public.nft_mint_requests.collection_id` → `public.nft_collections.id`
- `user_item_nfts_collection_id_fkey`：`public.user_item_nfts.collection_id` → `public.nft_collections.id`

---

## public.item_nft_metadata

**场景说明**：物品 → NFT 元数据映射：每种可铸造物品（`items`）对应一条 NFT metadata（IPFS metadata URI、属性等）与所属集合。用于铸造请求参数对齐与防篡改校验。

RLS: 开启 | 估算行数: 0

| 列名 | 类型 | 格式 | 属性 | 默认值 | 检查/枚举 | 列注释 |
| --- | --- | --- | --- | --- | --- | --- |
| `id` | uuid | uuid | — | gen_random_uuid() | — | — |
| `item_id` | uuid | uuid | unique | — | — | — |
| `collection_id` | uuid | uuid | — | — | — | — |
| `ipfs_metadata_uri` | text | text | — | — | — | — |
| `ipfs_image_uri` | text | text | nullable | — | — | — |
| `attributes` | jsonb | jsonb | — | '{}'::jsonb | — | — |
| `is_mintable` | boolean | bool | — | true | — | — |
| `created_at` | timestamp with time zone | timestamptz | — | now() | — | — |
| `updated_at` | timestamp with time zone | timestamptz | — | now() | — | — |

**主键**：`id`

**外键约束**：

- `item_nft_metadata_item_id_fkey`：`public.item_nft_metadata.item_id` → `public.items.id`
- `item_nft_metadata_collection_id_fkey`：`public.item_nft_metadata.collection_id` → `public.nft_collections.id`

---

## public.nft_mint_requests

**场景说明**：NFT 铸造请求：记录一次铸造所需 payload（BOC）、管理员签名、目标钱包与集合地址、状态流转与超时时间；并通过 `user_item_id` 锁定用户库存（`user_items.locked_for_mint`）避免并发重复铸造。

RLS: 开启 | 估算行数: 0

| 列名 | 类型 | 格式 | 属性 | 默认值 | 检查/枚举 | 列注释 |
| --- | --- | --- | --- | --- | --- | --- |
| `id` | uuid | uuid | — | gen_random_uuid() | — | — |
| `user_id` | uuid | uuid | — | — | — | — |
| `telegram_id` | bigint | int8 | — | — | — | — |
| `user_item_id` | uuid | uuid | — | — | — | — |
| `item_id` | uuid | uuid | — | — | — | — |
| `wallet_id` | uuid | uuid | — | — | — | — |
| `wallet_address` | text | text | — | — | — | — |
| `collection_id` | uuid | uuid | — | — | — | — |
| `collection_address` | text | text | — | — | — | — |
| `ipfs_metadata_uri` | text | text | — | — | — | — |
| `request_id` | uuid | uuid | — | — | — | — |
| `mint_payload_boc` | text | text | nullable | — | — | — |
| `payload_hash` | text | text | nullable | — | — | — |
| `admin_signature` | text | text | nullable | — | — | — |
| `status` | text | text | — | 'pending'::text | CHECK: status = ANY (ARRAY['pending'::text, 'signed'::text, 'broadcasted'::text, 'succeeded'::text, 'failed'::text, 'expired'::text]) | — |
| `failure_reason` | text | text | nullable | — | — | — |
| `expires_at` | timestamp with time zone | timestamptz | — | — | — | — |
| `broadcasted_tx_hash` | text | text | nullable | — | — | — |
| `confirmed_tx_hash` | text | text | nullable | — | — | — |
| `nft_item_address` | text | text | nullable | — | — | — |
| `created_at` | timestamp with time zone | timestamptz | — | now() | — | — |
| `updated_at` | timestamp with time zone | timestamptz | — | now() | — | — |
| `confirmed_at` | timestamp with time zone | timestamptz | nullable | — | — | — |

**主键**：`id`

**外键约束**：

- `nft_mint_requests_user_id_fkey`：`public.nft_mint_requests.user_id` → `public.users.id`
- `nft_mint_requests_user_item_id_fkey`：`public.nft_mint_requests.user_item_id` → `public.user_items.id`
- `nft_mint_requests_item_id_fkey`：`public.nft_mint_requests.item_id` → `public.items.id`
- `nft_mint_requests_wallet_id_fkey`：`public.nft_mint_requests.wallet_id` → `public.user_ton_wallets.id`
- `nft_mint_requests_collection_id_fkey`：`public.nft_mint_requests.collection_id` → `public.nft_collections.id`
- `user_item_nfts_mint_request_id_fkey`：`public.user_item_nfts.mint_request_id` → `public.nft_mint_requests.id`

---

## public.user_item_nfts

**场景说明**：已铸造 NFT 记录：把某个用户物品铸造成链上 NFT 后的结果落表（`nft_item_address`、`owner_address`、`tx_hash` 等），并与 `mint_request_id` 做 1:1 绑定。

RLS: 开启 | 估算行数: 0

| 列名 | 类型 | 格式 | 属性 | 默认值 | 检查/枚举 | 列注释 |
| --- | --- | --- | --- | --- | --- | --- |
| `id` | uuid | uuid | — | gen_random_uuid() | — | — |
| `user_id` | uuid | uuid | — | — | — | — |
| `item_id` | uuid | uuid | — | — | — | — |
| `collection_id` | uuid | uuid | — | — | — | — |
| `mint_request_id` | uuid | uuid | unique | — | — | — |
| `nft_item_address` | text | text | unique | — | — | — |
| `owner_address` | text | text | — | — | — | — |
| `tx_hash` | text | text | — | — | — | — |
| `ipfs_metadata_uri` | text | text | — | — | — | — |
| `minted_at` | timestamp with time zone | timestamptz | — | now() | — | — |
| `last_seen_owner_at` | timestamp with time zone | timestamptz | nullable | — | — | — |
| `is_burned` | boolean | bool | — | false | — | — |

**主键**：`id`

**外键约束**：

- `user_item_nfts_user_id_fkey`：`public.user_item_nfts.user_id` → `public.users.id`
- `user_item_nfts_item_id_fkey`：`public.user_item_nfts.item_id` → `public.items.id`
- `user_item_nfts_collection_id_fkey`：`public.user_item_nfts.collection_id` → `public.nft_collections.id`
- `user_item_nfts_mint_request_id_fkey`：`public.user_item_nfts.mint_request_id` → `public.nft_mint_requests.id`

---

## public.nft_chain_events

**场景说明**：链上事件落地表：用于接收 webhook / 轮询得到的链上交易事件（tx_hash、exit_code、raw_payload），并以 `processed` 标记防重复消费；用于驱动 `confirm_mint_nft_secure` 等结算流程。

RLS: 开启 | 估算行数: 0

| 列名 | 类型 | 格式 | 属性 | 默认值 | 检查/枚举 | 列注释 |
| --- | --- | --- | --- | --- | --- | --- |
| `id` | uuid | uuid | — | gen_random_uuid() | — | — |
| `source` | text | text | — | — | CHECK: source = ANY (ARRAY['tonapi_webhook'::text, 'toncenter_poll'::text, 'manual'::text]) | — |
| `external_event_id` | text | text | nullable | — | — | — |
| `collection_address` | text | text | — | — | — | — |
| `nft_item_address` | text | text | nullable | — | — | — |
| `tx_hash` | text | text | — | — | — | — |
| `exit_code` | integer | int4 | nullable | — | — | — |
| `raw_payload` | jsonb | jsonb | — | '{}'::jsonb | — | — |
| `processed` | boolean | bool | — | false | — | — |
| `processed_at` | timestamp with time zone | timestamptz | nullable | — | — | — |
| `received_at` | timestamp with time zone | timestamptz | — | now() | — | — |

**主键**：`id`

---

## auth.audit_log_entries

**场景说明**：Supabase Auth 审计日志：记录认证/管理侧相关事件载荷，用于安全审计与问题排查。

RLS: 开启 | 估算行数: 0

**表注释**：Auth: Audit trail for user actions.

| 列名 | 类型 | 格式 | 属性 | 默认值 | 检查/枚举 | 列注释 |
| --- | --- | --- | --- | --- | --- | --- |
| `instance_id` | uuid | uuid | nullable | — | — | — |
| `id` | uuid | uuid | — | — | — | — |
| `payload` | json | json | nullable | — | — | — |
| `created_at` | timestamp with time zone | timestamptz | nullable | — | — | — |
| `ip_address` | character varying | varchar | — | ''::character varying | — | — |

**主键**：`id`

---

## auth.custom_oauth_providers

**场景说明**：自定义 OAuth2/OIDC 身份提供商配置：在控制台配置「自定义第三方登录」时使用。

RLS: 关闭 | 估算行数: 0

| 列名 | 类型 | 格式 | 属性 | 默认值 | 检查/枚举 | 列注释 |
| --- | --- | --- | --- | --- | --- | --- |
| `id` | uuid | uuid | — | gen_random_uuid() | — | — |
| `provider_type` | text | text | — | — | CHECK: provider_type = ANY (ARRAY['oauth2'::text, 'oidc'::text]) | — |
| `identifier` | text | text | unique | — | CHECK: identifier ~ '^[a-z0-9][a-z0-9:-]{0,48}[a-z0-9]$'::text | — |
| `name` | text | text | — | — | CHECK: char_length(name) >= 1 AND char_length(name) <= 100 | — |
| `client_id` | text | text | — | — | CHECK: char_length(client_id) >= 1 AND char_length(client_id) <= 512 | — |
| `client_secret` | text | text | — | — | — | — |
| `acceptable_client_ids` | ARRAY | _text | — | '{}'::text[] | — | — |
| `scopes` | ARRAY | _text | — | '{}'::text[] | — | — |
| `pkce_enabled` | boolean | bool | — | true | — | — |
| `attribute_mapping` | jsonb | jsonb | — | '{}'::jsonb | — | — |
| `authorization_params` | jsonb | jsonb | — | '{}'::jsonb | — | — |
| `enabled` | boolean | bool | — | true | — | — |
| `email_optional` | boolean | bool | — | false | — | — |
| `issuer` | text | text | nullable | — | CHECK: issuer IS NULL OR char_length(issuer) >= 1 AND char_length(issuer) <= 2048 | — |
| `discovery_url` | text | text | nullable | — | CHECK: discovery_url IS NULL OR char_length(discovery_url) <= 2048 | — |
| `skip_nonce_check` | boolean | bool | — | false | — | — |
| `cached_discovery` | jsonb | jsonb | nullable | — | — | — |
| `discovery_cached_at` | timestamp with time zone | timestamptz | nullable | — | — | — |
| `authorization_url` | text | text | nullable | — | CHECK: authorization_url IS NULL OR authorization_url ~~ 'https://%'::text | — |
| `token_url` | text | text | nullable | — | CHECK: token_url IS NULL OR token_url ~~ 'https://%'::text | — |
| `userinfo_url` | text | text | nullable | — | CHECK: userinfo_url IS NULL OR userinfo_url ~~ 'https://%'::text | — |
| `jwks_uri` | text | text | nullable | — | CHECK: jwks_uri IS NULL OR jwks_uri ~~ 'https://%'::text | — |
| `created_at` | timestamp with time zone | timestamptz | — | now() | — | — |
| `updated_at` | timestamp with time zone | timestamptz | — | now() | — | — |

**主键**：`id`

---

## auth.flow_state

**场景说明**：OAuth/SSO 登录流程中间态：授权码、PKCE、provider token 等，完成登录后消费或过期。

RLS: 开启 | 估算行数: 0

**表注释**：Stores metadata for all OAuth/SSO login flows

| 列名 | 类型 | 格式 | 属性 | 默认值 | 检查/枚举 | 列注释 |
| --- | --- | --- | --- | --- | --- | --- |
| `id` | uuid | uuid | — | — | — | — |
| `user_id` | uuid | uuid | nullable | — | — | — |
| `auth_code` | text | text | nullable | — | — | — |
| `code_challenge_method` | USER-DEFINED | code_challenge_method | nullable | — | ENUM: s256, plain | — |
| `code_challenge` | text | text | nullable | — | — | — |
| `provider_type` | text | text | — | — | — | — |
| `provider_access_token` | text | text | nullable | — | — | — |
| `provider_refresh_token` | text | text | nullable | — | — | — |
| `created_at` | timestamp with time zone | timestamptz | nullable | — | — | — |
| `updated_at` | timestamp with time zone | timestamptz | nullable | — | — | — |
| `authentication_method` | text | text | — | — | — | — |
| `auth_code_issued_at` | timestamp with time zone | timestamptz | nullable | — | — | — |
| `invite_token` | text | text | nullable | — | — | — |
| `referrer` | text | text | nullable | — | — | — |
| `oauth_client_state_id` | uuid | uuid | nullable | — | — | — |
| `linking_target_id` | uuid | uuid | nullable | — | — | — |
| `email_optional` | boolean | bool | — | false | — | — |

**主键**：`id`

**外键约束**：

- `saml_relay_states_flow_state_id_fkey`：`auth.saml_relay_states.flow_state_id` → `auth.flow_state.id`

---

## auth.identities

**场景说明**：外部身份绑定：同一 `auth.users` 可对应多个 provider（GitHub、Google 等）的身份行。

RLS: 开启 | 估算行数: 0

**表注释**：Auth: Stores identities associated to a user.

| 列名 | 类型 | 格式 | 属性 | 默认值 | 检查/枚举 | 列注释 |
| --- | --- | --- | --- | --- | --- | --- |
| `provider_id` | text | text | — | — | — | — |
| `user_id` | uuid | uuid | — | — | — | — |
| `identity_data` | jsonb | jsonb | — | — | — | — |
| `provider` | text | text | — | — | — | — |
| `last_sign_in_at` | timestamp with time zone | timestamptz | nullable | — | — | — |
| `created_at` | timestamp with time zone | timestamptz | nullable | — | — | — |
| `updated_at` | timestamp with time zone | timestamptz | nullable | — | — | — |
| `email` | text | text | generated, nullable | lower((identity_data ->> 'email'::text)) | — | Auth: Email is a generated column that references the optional email property in the identity_data |
| `id` | uuid | uuid | — | gen_random_uuid() | — | — |

**主键**：`id`

**外键约束**：

- `identities_user_id_fkey`：`auth.identities.user_id` → `auth.users.id`

---

## auth.instances

**场景说明**：多实例/多站点相关元数据（较少直接使用），由 Auth 服务内部维护。

RLS: 开启 | 估算行数: 0

**表注释**：Auth: Manages users across multiple sites.

| 列名 | 类型 | 格式 | 属性 | 默认值 | 检查/枚举 | 列注释 |
| --- | --- | --- | --- | --- | --- | --- |
| `id` | uuid | uuid | — | — | — | — |
| `uuid` | uuid | uuid | nullable | — | — | — |
| `raw_base_config` | text | text | nullable | — | — | — |
| `created_at` | timestamp with time zone | timestamptz | nullable | — | — | — |
| `updated_at` | timestamp with time zone | timestamptz | nullable | — | — | — |

**主键**：`id`

---

## auth.mfa_amr_claims

**场景说明**：多因素认证 AMR（认证方法引用）声明：与会话绑定，表示本次会话通过了哪些认证方式。

RLS: 开启 | 估算行数: 0

**表注释**：auth: stores authenticator method reference claims for multi factor authentication

| 列名 | 类型 | 格式 | 属性 | 默认值 | 检查/枚举 | 列注释 |
| --- | --- | --- | --- | --- | --- | --- |
| `session_id` | uuid | uuid | — | — | — | — |
| `created_at` | timestamp with time zone | timestamptz | — | — | — | — |
| `updated_at` | timestamp with time zone | timestamptz | — | — | — | — |
| `authentication_method` | text | text | — | — | — | — |
| `id` | uuid | uuid | — | — | — | — |

**主键**：`id`

**外键约束**：

- `mfa_amr_claims_session_id_fkey`：`auth.mfa_amr_claims.session_id` → `auth.sessions.id`

---

## auth.mfa_challenges

**场景说明**：MFA 挑战记录：一次验证尝试的时间、IP、OTP 等，对应某个 MFA 因子。

RLS: 开启 | 估算行数: 0

**表注释**：auth: stores metadata about challenge requests made

| 列名 | 类型 | 格式 | 属性 | 默认值 | 检查/枚举 | 列注释 |
| --- | --- | --- | --- | --- | --- | --- |
| `id` | uuid | uuid | — | — | — | — |
| `factor_id` | uuid | uuid | — | — | — | — |
| `created_at` | timestamp with time zone | timestamptz | — | — | — | — |
| `verified_at` | timestamp with time zone | timestamptz | nullable | — | — | — |
| `ip_address` | inet | inet | — | — | — | — |
| `otp_code` | text | text | nullable | — | — | — |
| `web_authn_session_data` | jsonb | jsonb | nullable | — | — | — |

**主键**：`id`

**外键约束**：

- `mfa_challenges_auth_factor_id_fkey`：`auth.mfa_challenges.factor_id` → `auth.mfa_factors.id`

---

## auth.mfa_factors

**场景说明**：用户已注册的 MFA 因子：TOTP、WebAuthn、短信等及状态。

RLS: 开启 | 估算行数: 0

**表注释**：auth: stores metadata about factors

| 列名 | 类型 | 格式 | 属性 | 默认值 | 检查/枚举 | 列注释 |
| --- | --- | --- | --- | --- | --- | --- |
| `id` | uuid | uuid | — | — | — | — |
| `user_id` | uuid | uuid | — | — | — | — |
| `friendly_name` | text | text | nullable | — | — | — |
| `factor_type` | USER-DEFINED | factor_type | — | — | ENUM: totp, webauthn, phone | — |
| `status` | USER-DEFINED | factor_status | — | — | ENUM: unverified, verified | — |
| `created_at` | timestamp with time zone | timestamptz | — | — | — | — |
| `updated_at` | timestamp with time zone | timestamptz | — | — | — | — |
| `secret` | text | text | nullable | — | — | — |
| `phone` | text | text | nullable | — | — | — |
| `last_challenged_at` | timestamp with time zone | timestamptz | nullable, unique | — | — | — |
| `web_authn_credential` | jsonb | jsonb | nullable | — | — | — |
| `web_authn_aaguid` | uuid | uuid | nullable | — | — | — |
| `last_webauthn_challenge_data` | jsonb | jsonb | nullable | — | — | Stores the latest WebAuthn challenge data including attestation/assertion for customer verification |

**主键**：`id`

**外键约束**：

- `mfa_challenges_auth_factor_id_fkey`：`auth.mfa_challenges.factor_id` → `auth.mfa_factors.id`
- `mfa_factors_user_id_fkey`：`auth.mfa_factors.user_id` → `auth.users.id`

---

## auth.oauth_authorizations

**场景说明**：OAuth 2.1 授权端点产生的授权记录/授权码（Supabase 作为授权服务器、第三方应用接入场景）。

RLS: 关闭 | 估算行数: 0

| 列名 | 类型 | 格式 | 属性 | 默认值 | 检查/枚举 | 列注释 |
| --- | --- | --- | --- | --- | --- | --- |
| `id` | uuid | uuid | — | — | — | — |
| `authorization_id` | text | text | unique | — | — | — |
| `client_id` | uuid | uuid | — | — | — | — |
| `user_id` | uuid | uuid | nullable | — | — | — |
| `redirect_uri` | text | text | — | — | CHECK: char_length(redirect_uri) <= 2048 | — |
| `scope` | text | text | — | — | CHECK: char_length(scope) <= 4096 | — |
| `state` | text | text | nullable | — | CHECK: char_length(state) <= 4096 | — |
| `resource` | text | text | nullable | — | CHECK: char_length(resource) <= 2048 | — |
| `code_challenge` | text | text | nullable | — | CHECK: char_length(code_challenge) <= 128 | — |
| `code_challenge_method` | USER-DEFINED | code_challenge_method | nullable | — | ENUM: s256, plain | — |
| `response_type` | USER-DEFINED | oauth_response_type | — | 'code'::auth.oauth_response_type | ENUM: code | — |
| `status` | USER-DEFINED | oauth_authorization_status | — | 'pending'::auth.oauth_authorization_status | ENUM: pending, approved, denied, expired | — |
| `authorization_code` | text | text | nullable, unique | — | CHECK: char_length(authorization_code) <= 255 | — |
| `created_at` | timestamp with time zone | timestamptz | — | now() | — | — |
| `expires_at` | timestamp with time zone | timestamptz | — | (now() + '00:03:00'::interval) | — | — |
| `approved_at` | timestamp with time zone | timestamptz | nullable | — | — | — |
| `nonce` | text | text | nullable | — | CHECK: char_length(nonce) <= 255 | — |

**主键**：`id`

**外键约束**：

- `oauth_authorizations_client_id_fkey`：`auth.oauth_authorizations.client_id` → `auth.oauth_clients.id`
- `oauth_authorizations_user_id_fkey`：`auth.oauth_authorizations.user_id` → `auth.users.id`

---

## auth.oauth_client_states

**场景说明**：Supabase 作为 OAuth 客户端访问第三方 IdP 时的 state/nonce 等防重放数据。

RLS: 关闭 | 估算行数: 0

**表注释**：Stores OAuth states for third-party provider authentication flows where Supabase acts as the OAuth client.

| 列名 | 类型 | 格式 | 属性 | 默认值 | 检查/枚举 | 列注释 |
| --- | --- | --- | --- | --- | --- | --- |
| `id` | uuid | uuid | — | — | — | — |
| `provider_type` | text | text | — | — | — | — |
| `code_verifier` | text | text | nullable | — | — | — |
| `created_at` | timestamp with time zone | timestamptz | — | — | — | — |

**主键**：`id`

---

## auth.oauth_clients

**场景说明**：已注册的 OAuth 客户端（第三方应用）元数据：重定向 URI、grant 类型等。

RLS: 关闭 | 估算行数: 0

| 列名 | 类型 | 格式 | 属性 | 默认值 | 检查/枚举 | 列注释 |
| --- | --- | --- | --- | --- | --- | --- |
| `id` | uuid | uuid | — | — | — | — |
| `client_secret_hash` | text | text | nullable | — | — | — |
| `registration_type` | USER-DEFINED | oauth_registration_type | — | — | ENUM: dynamic, manual | — |
| `redirect_uris` | text | text | — | — | — | — |
| `grant_types` | text | text | — | — | — | — |
| `client_name` | text | text | nullable | — | CHECK: char_length(client_name) <= 1024 | — |
| `client_uri` | text | text | nullable | — | CHECK: char_length(client_uri) <= 2048 | — |
| `logo_uri` | text | text | nullable | — | CHECK: char_length(logo_uri) <= 2048 | — |
| `created_at` | timestamp with time zone | timestamptz | — | now() | — | — |
| `updated_at` | timestamp with time zone | timestamptz | — | now() | — | — |
| `deleted_at` | timestamp with time zone | timestamptz | nullable | — | — | — |
| `client_type` | USER-DEFINED | oauth_client_type | — | 'confidential'::auth.oauth_client_type | ENUM: public, confidential | — |
| `token_endpoint_auth_method` | text | text | — | — | CHECK: token_endpoint_auth_method = ANY (ARRAY['client_secret_basic'::text, 'client_secret_post'::text, 'none'::text]) | — |

**主键**：`id`

**外键约束**：

- `oauth_consents_client_id_fkey`：`auth.oauth_consents.client_id` → `auth.oauth_clients.id`
- `oauth_authorizations_client_id_fkey`：`auth.oauth_authorizations.client_id` → `auth.oauth_clients.id`
- `sessions_oauth_client_id_fkey`：`auth.sessions.oauth_client_id` → `auth.oauth_clients.id`

---

## auth.oauth_consents

**场景说明**：终端用户授予某 OAuth 客户端的 scope 及撤销时间。

RLS: 关闭 | 估算行数: 0

| 列名 | 类型 | 格式 | 属性 | 默认值 | 检查/枚举 | 列注释 |
| --- | --- | --- | --- | --- | --- | --- |
| `id` | uuid | uuid | — | — | — | — |
| `user_id` | uuid | uuid | — | — | — | — |
| `client_id` | uuid | uuid | — | — | — | — |
| `scopes` | text | text | — | — | CHECK: char_length(scopes) <= 2048 | — |
| `granted_at` | timestamp with time zone | timestamptz | — | now() | — | — |
| `revoked_at` | timestamp with time zone | timestamptz | nullable | — | — | — |

**主键**：`id`

**外键约束**：

- `oauth_consents_client_id_fkey`：`auth.oauth_consents.client_id` → `auth.oauth_clients.id`
- `oauth_consents_user_id_fkey`：`auth.oauth_consents.user_id` → `auth.users.id`

---

## auth.one_time_tokens

**场景说明**：一次性令牌：邮箱确认、重置密码、换绑邮箱/手机等流程的短期凭证。

RLS: 开启 | 估算行数: 0

| 列名 | 类型 | 格式 | 属性 | 默认值 | 检查/枚举 | 列注释 |
| --- | --- | --- | --- | --- | --- | --- |
| `id` | uuid | uuid | — | — | — | — |
| `user_id` | uuid | uuid | — | — | — | — |
| `token_type` | USER-DEFINED | one_time_token_type | — | — | ENUM: confirmation_token, reauthentication_token, recovery_token, email_change_token_new, email_change_token_current, phone_change_token | — |
| `token_hash` | text | text | — | — | CHECK: char_length(token_hash) > 0 | — |
| `relates_to` | text | text | — | — | — | — |
| `created_at` | timestamp without time zone | timestamp | — | now() | — | — |
| `updated_at` | timestamp without time zone | timestamp | — | now() | — | — |

**主键**：`id`

**外键约束**：

- `one_time_tokens_user_id_fkey`：`auth.one_time_tokens.user_id` → `auth.users.id`

---

## auth.refresh_tokens

**场景说明**：刷新访问令牌：与 `auth.sessions` 关联，用于在 JWT 过期后续期会话。

RLS: 开启 | 估算行数: 0

**表注释**：Auth: Store of tokens used to refresh JWT tokens once they expire.

| 列名 | 类型 | 格式 | 属性 | 默认值 | 检查/枚举 | 列注释 |
| --- | --- | --- | --- | --- | --- | --- |
| `instance_id` | uuid | uuid | nullable | — | — | — |
| `id` | bigint | int8 | — | nextval('auth.refresh_tokens_id_seq'::regclass) | — | — |
| `token` | character varying | varchar | nullable, unique | — | — | — |
| `user_id` | character varying | varchar | nullable | — | — | — |
| `revoked` | boolean | bool | nullable | — | — | — |
| `created_at` | timestamp with time zone | timestamptz | nullable | — | — | — |
| `updated_at` | timestamp with time zone | timestamptz | nullable | — | — | — |
| `parent` | character varying | varchar | nullable | — | — | — |
| `session_id` | uuid | uuid | nullable | — | — | — |

**主键**：`id`

**外键约束**：

- `refresh_tokens_session_id_fkey`：`auth.refresh_tokens.session_id` → `auth.sessions.id`

---

## auth.saml_providers

**场景说明**：SAML 身份提供商连接配置（企业 SSO）。

RLS: 开启 | 估算行数: 0

**表注释**：Auth: Manages SAML Identity Provider connections.

| 列名 | 类型 | 格式 | 属性 | 默认值 | 检查/枚举 | 列注释 |
| --- | --- | --- | --- | --- | --- | --- |
| `id` | uuid | uuid | — | — | — | — |
| `sso_provider_id` | uuid | uuid | — | — | — | — |
| `entity_id` | text | text | unique | — | CHECK: char_length(entity_id) > 0 | — |
| `metadata_xml` | text | text | — | — | CHECK: char_length(metadata_xml) > 0 | — |
| `metadata_url` | text | text | nullable | — | CHECK: metadata_url = NULL::text OR char_length(metadata_url) > 0 | — |
| `attribute_mapping` | jsonb | jsonb | nullable | — | — | — |
| `created_at` | timestamp with time zone | timestamptz | nullable | — | — | — |
| `updated_at` | timestamp with time zone | timestamptz | nullable | — | — | — |
| `name_id_format` | text | text | nullable | — | — | — |

**主键**：`id`

**外键约束**：

- `saml_providers_sso_provider_id_fkey`：`auth.saml_providers.sso_provider_id` → `auth.sso_providers.id`

---

## auth.saml_relay_states

**场景说明**：SAML SP 发起登录时的 RelayState 与请求关联数据。

RLS: 开启 | 估算行数: 0

**表注释**：Auth: Contains SAML Relay State information for each Service Provider initiated login.

| 列名 | 类型 | 格式 | 属性 | 默认值 | 检查/枚举 | 列注释 |
| --- | --- | --- | --- | --- | --- | --- |
| `id` | uuid | uuid | — | — | — | — |
| `sso_provider_id` | uuid | uuid | — | — | — | — |
| `request_id` | text | text | — | — | CHECK: char_length(request_id) > 0 | — |
| `for_email` | text | text | nullable | — | — | — |
| `redirect_to` | text | text | nullable | — | — | — |
| `created_at` | timestamp with time zone | timestamptz | nullable | — | — | — |
| `updated_at` | timestamp with time zone | timestamptz | nullable | — | — | — |
| `flow_state_id` | uuid | uuid | nullable | — | — | — |

**主键**：`id`

**外键约束**：

- `saml_relay_states_flow_state_id_fkey`：`auth.saml_relay_states.flow_state_id` → `auth.flow_state.id`
- `saml_relay_states_sso_provider_id_fkey`：`auth.saml_relay_states.sso_provider_id` → `auth.sso_providers.id`

---

## auth.schema_migrations

**场景说明**：Auth 子系统 schema 迁移版本表，由平台维护。

RLS: 开启 | 估算行数: 76

**表注释**：Auth: Manages updates to the auth system.

| 列名 | 类型 | 格式 | 属性 | 默认值 | 检查/枚举 | 列注释 |
| --- | --- | --- | --- | --- | --- | --- |
| `version` | character varying | varchar | — | — | — | — |

**主键**：`version`

---

## auth.sessions

**场景说明**：用户会话：刷新令牌、设备与 IP、OAuth client 等；登录态与 MFA 相关。

RLS: 开启 | 估算行数: 0

**表注释**：Auth: Stores session data associated to a user.

| 列名 | 类型 | 格式 | 属性 | 默认值 | 检查/枚举 | 列注释 |
| --- | --- | --- | --- | --- | --- | --- |
| `id` | uuid | uuid | — | — | — | — |
| `user_id` | uuid | uuid | — | — | — | — |
| `created_at` | timestamp with time zone | timestamptz | nullable | — | — | — |
| `updated_at` | timestamp with time zone | timestamptz | nullable | — | — | — |
| `factor_id` | uuid | uuid | nullable | — | — | — |
| `aal` | USER-DEFINED | aal_level | nullable | — | ENUM: aal1, aal2, aal3 | — |
| `not_after` | timestamp with time zone | timestamptz | nullable | — | — | Auth: Not after is a nullable column that contains a timestamp after which the session should be regarded as expired. |
| `refreshed_at` | timestamp without time zone | timestamp | nullable | — | — | — |
| `user_agent` | text | text | nullable | — | — | — |
| `ip` | inet | inet | nullable | — | — | — |
| `tag` | text | text | nullable | — | — | — |
| `oauth_client_id` | uuid | uuid | nullable | — | — | — |
| `refresh_token_hmac_key` | text | text | nullable | — | — | Holds a HMAC-SHA256 key used to sign refresh tokens for this session. |
| `refresh_token_counter` | bigint | int8 | nullable | — | — | Holds the ID (counter) of the last issued refresh token. |
| `scopes` | text | text | nullable | — | CHECK: char_length(scopes) <= 4096 | — |

**主键**：`id`

**外键约束**：

- `sessions_user_id_fkey`：`auth.sessions.user_id` → `auth.users.id`
- `sessions_oauth_client_id_fkey`：`auth.sessions.oauth_client_id` → `auth.oauth_clients.id`
- `refresh_tokens_session_id_fkey`：`auth.refresh_tokens.session_id` → `auth.sessions.id`
- `mfa_amr_claims_session_id_fkey`：`auth.mfa_amr_claims.session_id` → `auth.sessions.id`

---

## auth.sso_domains

**场景说明**：SSO：邮箱域名到某 SSO 提供商的映射。

RLS: 开启 | 估算行数: 0

**表注释**：Auth: Manages SSO email address domain mapping to an SSO Identity Provider.

| 列名 | 类型 | 格式 | 属性 | 默认值 | 检查/枚举 | 列注释 |
| --- | --- | --- | --- | --- | --- | --- |
| `id` | uuid | uuid | — | — | — | — |
| `sso_provider_id` | uuid | uuid | — | — | — | — |
| `domain` | text | text | — | — | CHECK: char_length(domain) > 0 | — |
| `created_at` | timestamp with time zone | timestamptz | nullable | — | — | — |
| `updated_at` | timestamp with time zone | timestamptz | nullable | — | — | — |

**主键**：`id`

**外键约束**：

- `sso_domains_sso_provider_id_fkey`：`auth.sso_domains.sso_provider_id` → `auth.sso_providers.id`

---

## auth.sso_providers

**场景说明**：SSO 提供商总表：与 SAML、域名等子表关联。

RLS: 开启 | 估算行数: 0

**表注释**：Auth: Manages SSO identity provider information; see saml_providers for SAML.

| 列名 | 类型 | 格式 | 属性 | 默认值 | 检查/枚举 | 列注释 |
| --- | --- | --- | --- | --- | --- | --- |
| `id` | uuid | uuid | — | — | — | — |
| `resource_id` | text | text | nullable | — | CHECK: resource_id = NULL::text OR char_length(resource_id) > 0 | Auth: Uniquely identifies a SSO provider according to a user-chosen resource ID (case insensitive), useful in infrastructure as code. |
| `created_at` | timestamp with time zone | timestamptz | nullable | — | — | — |
| `updated_at` | timestamp with time zone | timestamptz | nullable | — | — | — |
| `disabled` | boolean | bool | nullable | — | — | — |

**主键**：`id`

**外键约束**：

- `saml_providers_sso_provider_id_fkey`：`auth.saml_providers.sso_provider_id` → `auth.sso_providers.id`
- `saml_relay_states_sso_provider_id_fkey`：`auth.saml_relay_states.sso_provider_id` → `auth.sso_providers.id`
- `sso_domains_sso_provider_id_fkey`：`auth.sso_domains.sso_provider_id` → `auth.sso_providers.id`

---

## auth.users

**场景说明**：Supabase Auth 登录用户（邮箱/手机/密码等），是 JWT `sub` 对应的账户。**注意**：本项目业务玩家主体在 `public.users`（Telegram），若未启用 Supabase Auth 登录，此表通常为空或仅作平台预留。

RLS: 开启 | 估算行数: 0

**表注释**：Auth: Stores user login data within a secure schema.

| 列名 | 类型 | 格式 | 属性 | 默认值 | 检查/枚举 | 列注释 |
| --- | --- | --- | --- | --- | --- | --- |
| `instance_id` | uuid | uuid | nullable | — | — | — |
| `id` | uuid | uuid | — | — | — | — |
| `aud` | character varying | varchar | nullable | — | — | — |
| `role` | character varying | varchar | nullable | — | — | — |
| `email` | character varying | varchar | nullable | — | — | — |
| `encrypted_password` | character varying | varchar | nullable | — | — | — |
| `email_confirmed_at` | timestamp with time zone | timestamptz | nullable | — | — | — |
| `invited_at` | timestamp with time zone | timestamptz | nullable | — | — | — |
| `confirmation_token` | character varying | varchar | nullable | — | — | — |
| `confirmation_sent_at` | timestamp with time zone | timestamptz | nullable | — | — | — |
| `recovery_token` | character varying | varchar | nullable | — | — | — |
| `recovery_sent_at` | timestamp with time zone | timestamptz | nullable | — | — | — |
| `email_change_token_new` | character varying | varchar | nullable | — | — | — |
| `email_change` | character varying | varchar | nullable | — | — | — |
| `email_change_sent_at` | timestamp with time zone | timestamptz | nullable | — | — | — |
| `last_sign_in_at` | timestamp with time zone | timestamptz | nullable | — | — | — |
| `raw_app_meta_data` | jsonb | jsonb | nullable | — | — | — |
| `raw_user_meta_data` | jsonb | jsonb | nullable | — | — | — |
| `is_super_admin` | boolean | bool | nullable | — | — | — |
| `created_at` | timestamp with time zone | timestamptz | nullable | — | — | — |
| `updated_at` | timestamp with time zone | timestamptz | nullable | — | — | — |
| `phone` | text | text | nullable, unique | NULL::character varying | — | — |
| `phone_confirmed_at` | timestamp with time zone | timestamptz | nullable | — | — | — |
| `phone_change` | text | text | nullable | ''::character varying | — | — |
| `phone_change_token` | character varying | varchar | nullable | ''::character varying | — | — |
| `phone_change_sent_at` | timestamp with time zone | timestamptz | nullable | — | — | — |
| `confirmed_at` | timestamp with time zone | timestamptz | generated, nullable | LEAST(email_confirmed_at, phone_confirmed_at) | — | — |
| `email_change_token_current` | character varying | varchar | nullable | ''::character varying | — | — |
| `email_change_confirm_status` | smallint | int2 | nullable | 0 | CHECK: email_change_confirm_status >= 0 AND email_change_confirm_status <= 2 | — |
| `banned_until` | timestamp with time zone | timestamptz | nullable | — | — | — |
| `reauthentication_token` | character varying | varchar | nullable | ''::character varying | — | — |
| `reauthentication_sent_at` | timestamp with time zone | timestamptz | nullable | — | — | — |
| `is_sso_user` | boolean | bool | — | false | — | Auth: Set this column to true when the account comes from SSO. These accounts can have duplicate emails. |
| `deleted_at` | timestamp with time zone | timestamptz | nullable | — | — | — |
| `is_anonymous` | boolean | bool | — | false | — | — |

**主键**：`id`

**外键约束**：

- `mfa_factors_user_id_fkey`：`auth.mfa_factors.user_id` → `auth.users.id`
- `sessions_user_id_fkey`：`auth.sessions.user_id` → `auth.users.id`
- `identities_user_id_fkey`：`auth.identities.user_id` → `auth.users.id`
- `one_time_tokens_user_id_fkey`：`auth.one_time_tokens.user_id` → `auth.users.id`
- `oauth_authorizations_user_id_fkey`：`auth.oauth_authorizations.user_id` → `auth.users.id`
- `oauth_consents_user_id_fkey`：`auth.oauth_consents.user_id` → `auth.users.id`
- `webauthn_credentials_user_id_fkey`：`auth.webauthn_credentials.user_id` → `auth.users.id`
- `webauthn_challenges_user_id_fkey`：`auth.webauthn_challenges.user_id` → `auth.users.id`

---

## auth.webauthn_challenges

**场景说明**：WebAuthn 注册/登录过程中的 challenge 与会话数据，短期有效。

RLS: 关闭 | 估算行数: 0

| 列名 | 类型 | 格式 | 属性 | 默认值 | 检查/枚举 | 列注释 |
| --- | --- | --- | --- | --- | --- | --- |
| `id` | uuid | uuid | — | gen_random_uuid() | — | — |
| `user_id` | uuid | uuid | nullable | — | — | — |
| `challenge_type` | text | text | — | — | CHECK: challenge_type = ANY (ARRAY['signup'::text, 'registration'::text, 'authentication'::text]) | — |
| `session_data` | jsonb | jsonb | — | — | — | — |
| `created_at` | timestamp with time zone | timestamptz | — | now() | — | — |
| `expires_at` | timestamp with time zone | timestamptz | — | — | — | — |

**主键**：`id`

**外键约束**：

- `webauthn_challenges_user_id_fkey`：`auth.webauthn_challenges.user_id` → `auth.users.id`

---

## auth.webauthn_credentials

**场景说明**：用户已注册的 WebAuthn 公钥凭据，用于无密码/安全密钥登录。

RLS: 关闭 | 估算行数: 0

| 列名 | 类型 | 格式 | 属性 | 默认值 | 检查/枚举 | 列注释 |
| --- | --- | --- | --- | --- | --- | --- |
| `id` | uuid | uuid | — | gen_random_uuid() | — | — |
| `user_id` | uuid | uuid | — | — | — | — |
| `credential_id` | bytea | bytea | — | — | — | — |
| `public_key` | bytea | bytea | — | — | — | — |
| `attestation_type` | text | text | — | ''::text | — | — |
| `aaguid` | uuid | uuid | nullable | — | — | — |
| `sign_count` | bigint | int8 | — | 0 | — | — |
| `transports` | jsonb | jsonb | — | '[]'::jsonb | — | — |
| `backup_eligible` | boolean | bool | — | false | — | — |
| `backed_up` | boolean | bool | — | false | — | — |
| `friendly_name` | text | text | — | ''::text | — | — |
| `created_at` | timestamp with time zone | timestamptz | — | now() | — | — |
| `updated_at` | timestamp with time zone | timestamptz | — | now() | — | — |
| `last_used_at` | timestamp with time zone | timestamptz | nullable | — | — | — |

**主键**：`id`

**外键约束**：

- `webauthn_credentials_user_id_fkey`：`auth.webauthn_credentials.user_id` → `auth.users.id`

---

## storage.buckets

**场景说明**：存储桶定义：是否公开、文件大小与 MIME 限制等；其下挂具体对象与分片上传。

RLS: 开启 | 估算行数: 1

| 列名 | 类型 | 格式 | 属性 | 默认值 | 检查/枚举 | 列注释 |
| --- | --- | --- | --- | --- | --- | --- |
| `id` | text | text | — | — | — | — |
| `name` | text | text | — | — | — | — |
| `owner` | uuid | uuid | nullable | — | — | Field is deprecated, use owner_id instead |
| `created_at` | timestamp with time zone | timestamptz | nullable | now() | — | — |
| `updated_at` | timestamp with time zone | timestamptz | nullable | now() | — | — |
| `public` | boolean | bool | nullable | false | — | — |
| `avif_autodetection` | boolean | bool | nullable | false | — | — |
| `file_size_limit` | bigint | int8 | nullable | — | — | — |
| `allowed_mime_types` | ARRAY | _text | nullable | — | — | — |
| `owner_id` | text | text | nullable | — | — | — |
| `type` | USER-DEFINED | buckettype | — | 'STANDARD'::storage.buckettype | ENUM: STANDARD, ANALYTICS, VECTOR | — |

**主键**：`id`

**外键约束**：

- `s3_multipart_uploads_parts_bucket_id_fkey`：`storage.s3_multipart_uploads_parts.bucket_id` → `storage.buckets.id`
- `objects_bucketId_fkey`：`storage.objects.bucket_id` → `storage.buckets.id`
- `s3_multipart_uploads_bucket_id_fkey`：`storage.s3_multipart_uploads.bucket_id` → `storage.buckets.id`

---

## storage.buckets_analytics

**场景说明**：Analytics 类桶（如 Iceberg），用于大数据分析型存储能力。

RLS: 开启 | 估算行数: 0

| 列名 | 类型 | 格式 | 属性 | 默认值 | 检查/枚举 | 列注释 |
| --- | --- | --- | --- | --- | --- | --- |
| `name` | text | text | — | — | — | — |
| `type` | USER-DEFINED | buckettype | — | 'ANALYTICS'::storage.buckettype | ENUM: STANDARD, ANALYTICS, VECTOR | — |
| `format` | text | text | — | 'ICEBERG'::text | — | — |
| `created_at` | timestamp with time zone | timestamptz | — | now() | — | — |
| `updated_at` | timestamp with time zone | timestamptz | — | now() | — | — |
| `id` | uuid | uuid | — | gen_random_uuid() | — | — |
| `deleted_at` | timestamp with time zone | timestamptz | nullable | — | — | — |

**主键**：`id`

---

## storage.buckets_vectors

**场景说明**：向量存储型桶：与向量索引配合，用于向量检索场景。

RLS: 开启 | 估算行数: 0

| 列名 | 类型 | 格式 | 属性 | 默认值 | 检查/枚举 | 列注释 |
| --- | --- | --- | --- | --- | --- | --- |
| `id` | text | text | — | — | — | — |
| `type` | USER-DEFINED | buckettype | — | 'VECTOR'::storage.buckettype | ENUM: STANDARD, ANALYTICS, VECTOR | — |
| `created_at` | timestamp with time zone | timestamptz | — | now() | — | — |
| `updated_at` | timestamp with time zone | timestamptz | — | now() | — | — |

**主键**：`id`

**外键约束**：

- `vector_indexes_bucket_id_fkey`：`storage.vector_indexes.bucket_id` → `storage.buckets_vectors.id`

---

## 附录：`public` 元数据导出（RLS / Indexes / UNIQUE / Triggers）

> 数据来源：Supabase MCP `execute_sql` 只读查询 `pg_catalog`（同步时间同本文档头部）。

### A. RLS policies（`pg_policies`）

> 说明：仅列出 `public` schema 下已存在的 policy。其余表若显示 “RLS: 开启” 但 **没有 policy**，则对 `anon/authenticated` 默认不可访问。

- `public.case_items`
  - `Public read access for case_items`: `SELECT` for roles `{public}` — `USING (true)`
- `public.cases`
  - `Public read access for cases`: `SELECT` for roles `{public}` — `USING (true)`
- `public.items`
  - `Public read access for items`: `SELECT` for roles `{public}` — `USING (true)`
- `public.leaderboard`
  - `Public read access for leaderboard`: `SELECT` for roles `{public}` — `USING (true)`

### B. Indexes（`pg_indexes`）

- `public.api_rate_limits`
  - `api_rate_limits_pkey`: `CREATE UNIQUE INDEX api_rate_limits_pkey ON public.api_rate_limits USING btree (scope, route, window_start)`
  - `api_rate_limits_updated_at_idx`: `CREATE INDEX api_rate_limits_updated_at_idx ON public.api_rate_limits USING btree (updated_at)`
- `public.case_items`
  - `case_items_pkey`: `CREATE UNIQUE INDEX case_items_pkey ON public.case_items USING btree (id)`
  - `case_items_case_id_item_id_key`: `CREATE UNIQUE INDEX case_items_case_id_item_id_key ON public.case_items USING btree (case_id, item_id)`
  - `idx_case_items_case_id`: `CREATE INDEX idx_case_items_case_id ON public.case_items USING btree (case_id)`
- `public.cases`
  - `cases_pkey`: `CREATE UNIQUE INDEX cases_pkey ON public.cases USING btree (id)`
  - `cases_case_key_key`: `CREATE UNIQUE INDEX cases_case_key_key ON public.cases USING btree (case_key)`
- `public.chest_open_events`
  - `chest_open_events_pkey`: `CREATE UNIQUE INDEX chest_open_events_pkey ON public.chest_open_events USING btree (id)`
  - `chest_open_events_user_id_request_id_key`: `CREATE UNIQUE INDEX chest_open_events_user_id_request_id_key ON public.chest_open_events USING btree (user_id, request_id)`
- `public.invite_rewards`
  - `invite_rewards_pkey`: `CREATE UNIQUE INDEX invite_rewards_pkey ON public.invite_rewards USING btree (id)`
  - `invite_rewards_created_at_idx`: `CREATE INDEX invite_rewards_created_at_idx ON public.invite_rewards USING btree (created_at DESC)`
  - `invite_rewards_inviter_user_id_status_idx`: `CREATE INDEX invite_rewards_inviter_user_id_status_idx ON public.invite_rewards USING btree (inviter_user_id, status)`
  - `invite_rewards_reward_type_idx`: `CREATE INDEX invite_rewards_reward_type_idx ON public.invite_rewards USING btree (reward_type)`
  - `invite_rewards_unique_invitation_id`: `CREATE UNIQUE INDEX invite_rewards_unique_invitation_id ON public.invite_rewards USING btree (invitation_id)`
  - `invite_rewards_unique_item_once`: `CREATE UNIQUE INDEX invite_rewards_unique_item_once ON public.invite_rewards USING btree (invitation_id, item_id) WHERE ((reward_type = 'item'::text) AND (item_id IS NOT NULL))`
  - `invite_rewards_unique_numeric_once`: `CREATE UNIQUE INDEX invite_rewards_unique_numeric_once ON public.invite_rewards USING btree (invitation_id) WHERE (reward_type = ANY (ARRAY['coins'::text, 'points'::text]))`
- `public.item_nft_metadata`
  - `item_nft_metadata_pkey`: `CREATE UNIQUE INDEX item_nft_metadata_pkey ON public.item_nft_metadata USING btree (id)`
  - `item_nft_metadata_item_id_key`: `CREATE UNIQUE INDEX item_nft_metadata_item_id_key ON public.item_nft_metadata USING btree (item_id)`
- `public.items`
  - `items_pkey`: `CREATE UNIQUE INDEX items_pkey ON public.items USING btree (id)`
- `public.leaderboard`
  - `leaderboard_pkey`: `CREATE UNIQUE INDEX leaderboard_pkey ON public.leaderboard USING btree (id)`
- `public.nft_chain_events`
  - `nft_chain_events_pkey`: `CREATE UNIQUE INDEX nft_chain_events_pkey ON public.nft_chain_events USING btree (id)`
  - `nft_chain_events_processed_received_at_idx`: `CREATE INDEX nft_chain_events_processed_received_at_idx ON public.nft_chain_events USING btree (processed, received_at)`
  - `uq_nft_chain_events_source_external_event`: `CREATE UNIQUE INDEX uq_nft_chain_events_source_external_event ON public.nft_chain_events USING btree (source, external_event_id) WHERE (external_event_id IS NOT NULL)`
  - `uq_nft_chain_events_tx_hash_nft_item`: `CREATE UNIQUE INDEX uq_nft_chain_events_tx_hash_nft_item ON public.nft_chain_events USING btree (tx_hash, nft_item_address)`
- `public.nft_collections`
  - `nft_collections_pkey`: `CREATE UNIQUE INDEX nft_collections_pkey ON public.nft_collections USING btree (id)`
  - `nft_collections_collection_key_key`: `CREATE UNIQUE INDEX nft_collections_collection_key_key ON public.nft_collections USING btree (collection_key)`
  - `nft_collections_collection_address_key`: `CREATE UNIQUE INDEX nft_collections_collection_address_key ON public.nft_collections USING btree (collection_address)`
- `public.nft_mint_requests`
  - `nft_mint_requests_pkey`: `CREATE UNIQUE INDEX nft_mint_requests_pkey ON public.nft_mint_requests USING btree (id)`
  - `nft_mint_requests_status_expires_at_idx`: `CREATE INDEX nft_mint_requests_status_expires_at_idx ON public.nft_mint_requests USING btree (status, expires_at)`
  - `uq_nft_mint_requests_user_request`: `CREATE UNIQUE INDEX uq_nft_mint_requests_user_request ON public.nft_mint_requests USING btree (user_id, request_id)`
  - `uq_nft_mint_requests_user_item_inflight`: `CREATE UNIQUE INDEX uq_nft_mint_requests_user_item_inflight ON public.nft_mint_requests USING btree (user_item_id) WHERE (status = ANY (ARRAY['pending'::text, 'signed'::text, 'broadcasted'::text]))`
  - `uq_nft_mint_requests_confirmed_tx_hash`: `CREATE UNIQUE INDEX uq_nft_mint_requests_confirmed_tx_hash ON public.nft_mint_requests USING btree (confirmed_tx_hash) WHERE (confirmed_tx_hash IS NOT NULL)`
- `public.purchase_orders`
  - `purchase_orders_pkey`: `CREATE UNIQUE INDEX purchase_orders_pkey ON public.purchase_orders USING btree (id)`
  - `purchase_orders_user_id_request_id_key`: `CREATE UNIQUE INDEX purchase_orders_user_id_request_id_key ON public.purchase_orders USING btree (user_id, request_id)`
  - `purchase_orders_user_created_at_idx`: `CREATE INDEX purchase_orders_user_created_at_idx ON public.purchase_orders USING btree (user_id, created_at DESC)`
- `public.resource_transactions`
  - `resource_transactions_pkey`: `CREATE UNIQUE INDEX resource_transactions_pkey ON public.resource_transactions USING btree (id)`
  - `idx_transactions_user_id`: `CREATE INDEX idx_transactions_user_id ON public.resource_transactions USING btree (user_id)`
  - `idx_transactions_created_at`: `CREATE INDEX idx_transactions_created_at ON public.resource_transactions USING btree (created_at)`
- `public.shop_products`
  - `shop_products_pkey`: `CREATE UNIQUE INDEX shop_products_pkey ON public.shop_products USING btree (id)`
  - `shop_products_active_idx`: `CREATE INDEX shop_products_active_idx ON public.shop_products USING btree (is_active, product_type, currency)`
  - `shop_products_unique_case_currency`: `CREATE UNIQUE INDEX shop_products_unique_case_currency ON public.shop_products USING btree (case_id, currency) WHERE ((product_type = 'case'::text) AND (case_id IS NOT NULL))`
  - `shop_products_unique_item_currency`: `CREATE UNIQUE INDEX shop_products_unique_item_currency ON public.shop_products USING btree (item_id, currency) WHERE ((product_type = 'item'::text) AND (item_id IS NOT NULL))`
- `public.user_cases`
  - `user_cases_pkey`: `CREATE UNIQUE INDEX user_cases_pkey ON public.user_cases USING btree (id)`
  - `user_cases_user_id_case_id_key`: `CREATE UNIQUE INDEX user_cases_user_id_case_id_key ON public.user_cases USING btree (user_id, case_id)`
  - `idx_user_cases_user_id`: `CREATE INDEX idx_user_cases_user_id ON public.user_cases USING btree (user_id)`
  - `idx_user_cases_case_id`: `CREATE INDEX idx_user_cases_case_id ON public.user_cases USING btree (case_id)`
- `public.user_invites`
  - `user_invites_pkey`: `CREATE UNIQUE INDEX user_invites_pkey ON public.user_invites USING btree (id)`
  - `user_invites_unique_pair`: `CREATE UNIQUE INDEX user_invites_unique_pair ON public.user_invites USING btree (inviter_user_id, invitee_user_id)`
  - `user_invites_unique_invitee`: `CREATE UNIQUE INDEX user_invites_unique_invitee ON public.user_invites USING btree (invitee_user_id)`
  - `user_invites_unique_invitee_user_id`: `CREATE UNIQUE INDEX user_invites_unique_invitee_user_id ON public.user_invites USING btree (invitee_user_id)`
  - `user_invites_inviter_user_id_created_at_idx`: `CREATE INDEX user_invites_inviter_user_id_created_at_idx ON public.user_invites USING btree (inviter_user_id, created_at DESC)`
  - `user_invites_inviter_user_id_status_idx`: `CREATE INDEX user_invites_inviter_user_id_status_idx ON public.user_invites USING btree (inviter_user_id, status)`
  - `user_invites_status_created_at_idx`: `CREATE INDEX user_invites_status_created_at_idx ON public.user_invites USING btree (status, created_at DESC)`
- `public.user_item_nfts`
  - `user_item_nfts_pkey`: `CREATE UNIQUE INDEX user_item_nfts_pkey ON public.user_item_nfts USING btree (id)`
  - `user_item_nfts_mint_request_id_key`: `CREATE UNIQUE INDEX user_item_nfts_mint_request_id_key ON public.user_item_nfts USING btree (mint_request_id)`
  - `user_item_nfts_nft_item_address_key`: `CREATE UNIQUE INDEX user_item_nfts_nft_item_address_key ON public.user_item_nfts USING btree (nft_item_address)`
- `public.user_items`
  - `user_items_pkey`: `CREATE UNIQUE INDEX user_items_pkey ON public.user_items USING btree (id)`
  - `user_items_user_id_item_id_key`: `CREATE UNIQUE INDEX user_items_user_id_item_id_key ON public.user_items USING btree (user_id, item_id)`
  - `idx_user_items_user_id`: `CREATE INDEX idx_user_items_user_id ON public.user_items USING btree (user_id)`
  - `idx_user_items_item_id`: `CREATE INDEX idx_user_items_item_id ON public.user_items USING btree (item_id)`
- `public.user_prepared_messages`
  - `user_prepared_messages_pkey`: `CREATE UNIQUE INDEX user_prepared_messages_pkey ON public.user_prepared_messages USING btree (id)`
  - `user_prepared_messages_user_id_kind_key`: `CREATE UNIQUE INDEX user_prepared_messages_user_id_kind_key ON public.user_prepared_messages USING btree (user_id, kind)`
  - `user_prepared_messages_user_kind_idx`: `CREATE INDEX user_prepared_messages_user_kind_idx ON public.user_prepared_messages USING btree (user_id, kind)`
- `public.user_ton_wallets`
  - `user_ton_wallets_pkey`: `CREATE UNIQUE INDEX user_ton_wallets_pkey ON public.user_ton_wallets USING btree (id)`
  - `user_ton_wallets_user_id_idx`: `CREATE INDEX user_ton_wallets_user_id_idx ON public.user_ton_wallets USING btree (user_id)`
  - `uq_user_ton_wallets_user_wallet_active`: `CREATE UNIQUE INDEX uq_user_ton_wallets_user_wallet_active ON public.user_ton_wallets USING btree (user_id, wallet_address) WHERE (unbound_at IS NULL)`
  - `uq_user_ton_wallets_primary_wallet_unique`: `CREATE UNIQUE INDEX uq_user_ton_wallets_primary_wallet_unique ON public.user_ton_wallets USING btree (wallet_address) WHERE ((is_primary = true) AND (unbound_at IS NULL))`
- `public.users`
  - `users_pkey`: `CREATE UNIQUE INDEX users_pkey ON public.users USING btree (id)`
  - `users_telegram_id_key`: `CREATE UNIQUE INDEX users_telegram_id_key ON public.users USING btree (telegram_id)`
  - `idx_users_telegram_id`: `CREATE INDEX idx_users_telegram_id ON public.users USING btree (telegram_id)`

### C. PK / UNIQUE 约束（`pg_constraint`，仅 `p/u`）

> 说明：此处为 Postgres “约束”层面的 PK/UNIQUE；部分幂等/并发保护使用的是 **partial unique index**（见上文 Indexes），不会出现在这里。

- `public.api_rate_limits`: `api_rate_limits_pkey` — `PRIMARY KEY (scope, route, window_start)`
- `public.case_items`: `case_items_pkey` — `PRIMARY KEY (id)`；`case_items_case_id_item_id_key` — `UNIQUE (case_id, item_id)`
- `public.cases`: `cases_pkey` — `PRIMARY KEY (id)`；`cases_case_key_key` — `UNIQUE (case_key)`
- `public.chest_open_events`: `chest_open_events_pkey` — `PRIMARY KEY (id)`；`chest_open_events_user_id_request_id_key` — `UNIQUE (user_id, request_id)`
- `public.invite_rewards`: `invite_rewards_pkey` — `PRIMARY KEY (id)`
- `public.item_nft_metadata`: `item_nft_metadata_pkey` — `PRIMARY KEY (id)`；`item_nft_metadata_item_id_key` — `UNIQUE (item_id)`
- `public.items`: `items_pkey` — `PRIMARY KEY (id)`
- `public.leaderboard`: `leaderboard_pkey` — `PRIMARY KEY (id)`
- `public.nft_chain_events`: `nft_chain_events_pkey` — `PRIMARY KEY (id)`
- `public.nft_collections`: `nft_collections_pkey` — `PRIMARY KEY (id)`；`nft_collections_collection_key_key` — `UNIQUE (collection_key)`；`nft_collections_collection_address_key` — `UNIQUE (collection_address)`
- `public.nft_mint_requests`: `nft_mint_requests_pkey` — `PRIMARY KEY (id)`；`uq_nft_mint_requests_user_request` — `UNIQUE (user_id, request_id)`
- `public.purchase_orders`: `purchase_orders_pkey` — `PRIMARY KEY (id)`；`purchase_orders_user_id_request_id_key` — `UNIQUE (user_id, request_id)`
- `public.resource_transactions`: `resource_transactions_pkey` — `PRIMARY KEY (id)`
- `public.shop_products`: `shop_products_pkey` — `PRIMARY KEY (id)`
- `public.user_cases`: `user_cases_pkey` — `PRIMARY KEY (id)`；`user_cases_user_id_case_id_key` — `UNIQUE (user_id, case_id)`
- `public.user_invites`: `user_invites_pkey` — `PRIMARY KEY (id)`
- `public.user_item_nfts`: `user_item_nfts_pkey` — `PRIMARY KEY (id)`；`user_item_nfts_mint_request_id_key` — `UNIQUE (mint_request_id)`；`user_item_nfts_nft_item_address_key` — `UNIQUE (nft_item_address)`
- `public.user_items`: `user_items_pkey` — `PRIMARY KEY (id)`；`user_items_user_id_item_id_key` — `UNIQUE (user_id, item_id)`
- `public.user_prepared_messages`: `user_prepared_messages_pkey` — `PRIMARY KEY (id)`；`user_prepared_messages_user_id_kind_key` — `UNIQUE (user_id, kind)`
- `public.user_ton_wallets`: `user_ton_wallets_pkey` — `PRIMARY KEY (id)`
- `public.users`: `users_pkey` — `PRIMARY KEY (id)`；`users_telegram_id_key` — `UNIQUE (telegram_id)`

### D. Triggers → Functions（`pg_trigger` + `pg_proc`）

- `public.invite_rewards`
  - `trg_invite_rewards_guard` → `public.tg_invite_rewards_guard()`
    - `CREATE TRIGGER trg_invite_rewards_guard BEFORE INSERT ON invite_rewards FOR EACH ROW EXECUTE FUNCTION tg_invite_rewards_guard()`
  - `trg_invite_rewards_update_guard` → `public.tg_invite_rewards_update_guard()`
    - `CREATE TRIGGER trg_invite_rewards_update_guard BEFORE UPDATE ON invite_rewards FOR EACH ROW EXECUTE FUNCTION tg_invite_rewards_update_guard()`
- `public.item_nft_metadata`
  - `trg_item_nft_metadata_immutability_guard` → `public.item_nft_metadata_immutability_guard()`
    - `CREATE TRIGGER trg_item_nft_metadata_immutability_guard BEFORE UPDATE ON item_nft_metadata FOR EACH ROW EXECUTE FUNCTION item_nft_metadata_immutability_guard()`
  - `trg_item_nft_metadata_updated_at` → `public.set_updated_at()`
    - `CREATE TRIGGER trg_item_nft_metadata_updated_at BEFORE UPDATE ON item_nft_metadata FOR EACH ROW EXECUTE FUNCTION set_updated_at()`
- `public.nft_collections`
  - `trg_nft_collections_updated_at` → `public.set_updated_at()`
    - `CREATE TRIGGER trg_nft_collections_updated_at BEFORE UPDATE ON nft_collections FOR EACH ROW EXECUTE FUNCTION set_updated_at()`
- `public.nft_mint_requests`
  - `trg_nft_mint_requests_update_guard` → `public.nft_mint_requests_update_guard()`
    - `CREATE TRIGGER trg_nft_mint_requests_update_guard BEFORE UPDATE ON nft_mint_requests FOR EACH ROW EXECUTE FUNCTION nft_mint_requests_update_guard()`
  - `trg_nft_mint_requests_updated_at` → `public.set_updated_at()`
    - `CREATE TRIGGER trg_nft_mint_requests_updated_at BEFORE UPDATE ON nft_mint_requests FOR EACH ROW EXECUTE FUNCTION set_updated_at()`
- `public.purchase_orders`
  - `trg_purchase_orders_updated_at` → `public.set_updated_at()`
    - `CREATE TRIGGER trg_purchase_orders_updated_at BEFORE UPDATE ON purchase_orders FOR EACH ROW EXECUTE FUNCTION set_updated_at()`
- `public.shop_products`
  - `trg_shop_products_updated_at` → `public.set_updated_at()`
    - `CREATE TRIGGER trg_shop_products_updated_at BEFORE UPDATE ON shop_products FOR EACH ROW EXECUTE FUNCTION set_updated_at()`
- `public.user_invites`
  - `trg_user_invites_set_snapshots_and_guard` → `public.tg_user_invites_set_snapshots_and_guard()`
    - `CREATE TRIGGER trg_user_invites_set_snapshots_and_guard BEFORE INSERT ON user_invites FOR EACH ROW EXECUTE FUNCTION tg_user_invites_set_snapshots_and_guard()`
  - `trg_user_invites_update_guard` → `public.tg_user_invites_update_guard()`
    - `CREATE TRIGGER trg_user_invites_update_guard BEFORE UPDATE ON user_invites FOR EACH ROW EXECUTE FUNCTION tg_user_invites_update_guard()`
- `public.user_item_nfts`
  - `trg_user_item_nfts_immutability_guard` → `public.user_item_nfts_immutability_guard()`
    - `CREATE TRIGGER trg_user_item_nfts_immutability_guard BEFORE UPDATE ON user_item_nfts FOR EACH ROW EXECUTE FUNCTION user_item_nfts_immutability_guard()`

---

## storage.migrations

**场景说明**：Storage 服务内部 schema 迁移版本，由平台维护。

RLS: 开启 | 估算行数: 59

| 列名 | 类型 | 格式 | 属性 | 默认值 | 检查/枚举 | 列注释 |
| --- | --- | --- | --- | --- | --- | --- |
| `id` | integer | int4 | — | — | — | — |
| `name` | character varying | varchar | unique | — | — | — |
| `hash` | character varying | varchar | — | — | — | — |
| `executed_at` | timestamp without time zone | timestamp | nullable | CURRENT_TIMESTAMP | — | — |

**主键**：`id`

---

## storage.objects

**场景说明**：桶内对象（文件）元数据：路径、版本、自定义元数据等；对应用户上传的头像、资源文件等。

RLS: 开启 | 估算行数: 9

| 列名 | 类型 | 格式 | 属性 | 默认值 | 检查/枚举 | 列注释 |
| --- | --- | --- | --- | --- | --- | --- |
| `id` | uuid | uuid | — | gen_random_uuid() | — | — |
| `bucket_id` | text | text | nullable | — | — | — |
| `name` | text | text | nullable | — | — | — |
| `owner` | uuid | uuid | nullable | — | — | Field is deprecated, use owner_id instead |
| `created_at` | timestamp with time zone | timestamptz | nullable | now() | — | — |
| `updated_at` | timestamp with time zone | timestamptz | nullable | now() | — | — |
| `last_accessed_at` | timestamp with time zone | timestamptz | nullable | now() | — | — |
| `metadata` | jsonb | jsonb | nullable | — | — | — |
| `path_tokens` | ARRAY | _text | generated, nullable | string_to_array(name, '/'::text) | — | — |
| `version` | text | text | nullable | — | — | — |
| `owner_id` | text | text | nullable | — | — | — |
| `user_metadata` | jsonb | jsonb | nullable | — | — | — |

**主键**：`id`

**外键约束**：

- `objects_bucketId_fkey`：`storage.objects.bucket_id` → `storage.buckets.id`

---

## storage.s3_multipart_uploads

**场景说明**：大文件分片上传任务：上传 id、桶、对象 key 与进度。

RLS: 开启 | 估算行数: 0

| 列名 | 类型 | 格式 | 属性 | 默认值 | 检查/枚举 | 列注释 |
| --- | --- | --- | --- | --- | --- | --- |
| `id` | text | text | — | — | — | — |
| `in_progress_size` | bigint | int8 | — | 0 | — | — |
| `upload_signature` | text | text | — | — | — | — |
| `bucket_id` | text | text | — | — | — | — |
| `key` | text | text | — | — | — | — |
| `version` | text | text | — | — | — | — |
| `owner_id` | text | text | nullable | — | — | — |
| `created_at` | timestamp with time zone | timestamptz | — | now() | — | — |
| `user_metadata` | jsonb | jsonb | nullable | — | — | — |
| `metadata` | jsonb | jsonb | nullable | — | — | — |

**主键**：`id`

**外键约束**：

- `s3_multipart_uploads_bucket_id_fkey`：`storage.s3_multipart_uploads.bucket_id` → `storage.buckets.id`
- `s3_multipart_uploads_parts_upload_id_fkey`：`storage.s3_multipart_uploads_parts.upload_id` → `storage.s3_multipart_uploads.id`

---

## storage.s3_multipart_uploads_parts

**场景说明**：分片上传的各分片记录：序号、大小、ETag 等。

RLS: 开启 | 估算行数: 0

| 列名 | 类型 | 格式 | 属性 | 默认值 | 检查/枚举 | 列注释 |
| --- | --- | --- | --- | --- | --- | --- |
| `id` | uuid | uuid | — | gen_random_uuid() | — | — |
| `upload_id` | text | text | — | — | — | — |
| `size` | bigint | int8 | — | 0 | — | — |
| `part_number` | integer | int4 | — | — | — | — |
| `bucket_id` | text | text | — | — | — | — |
| `key` | text | text | — | — | — | — |
| `etag` | text | text | — | — | — | — |
| `owner_id` | text | text | nullable | — | — | — |
| `version` | text | text | — | — | — | — |
| `created_at` | timestamp with time zone | timestamptz | — | now() | — | — |

**主键**：`id`

**外键约束**：

- `s3_multipart_uploads_parts_upload_id_fkey`：`storage.s3_multipart_uploads_parts.upload_id` → `storage.s3_multipart_uploads.id`
- `s3_multipart_uploads_parts_bucket_id_fkey`：`storage.s3_multipart_uploads_parts.bucket_id` → `storage.buckets.id`

---

## storage.vector_indexes

**场景说明**：向量桶上的向量索引定义：维度、距离度量与配置 JSON。

RLS: 开启 | 估算行数: 0

| 列名 | 类型 | 格式 | 属性 | 默认值 | 检查/枚举 | 列注释 |
| --- | --- | --- | --- | --- | --- | --- |
| `id` | text | text | — | gen_random_uuid() | — | — |
| `name` | text | text | — | — | — | — |
| `bucket_id` | text | text | — | — | — | — |
| `data_type` | text | text | — | — | — | — |
| `dimension` | integer | int4 | — | — | — | — |
| `distance_metric` | text | text | — | — | — | — |
| `metadata_configuration` | jsonb | jsonb | nullable | — | — | — |
| `created_at` | timestamp with time zone | timestamptz | — | now() | — | — |
| `updated_at` | timestamp with time zone | timestamptz | — | now() | — | — |

**主键**：`id`

**外键约束**：

- `vector_indexes_bucket_id_fkey`：`storage.vector_indexes.bucket_id` → `storage.buckets_vectors.id`
