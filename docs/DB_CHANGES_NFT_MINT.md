# 数据库变更规划：藏品铸造 NFT 上 TON 链（第三阶段 3.1）

> 规划日期：2026-04-21
> 目标阶段：NFT 铸造 · 后端服务 3.1 — 游戏数据库改造
> 关联文件：[`DB_TABLES.md`](./DB_TABLES.md)、[`RPC_FUNCTIONS.md`](./RPC_FUNCTIONS.md)
> 集合合约地址（第一阶段已部署）：`EQCqzvnOjeJG2-FD9OjgIokSba5YzcDALfffCzQBQaFWy-lM`

---

## 0. 设计目标与约束

1. **状态机严谨性**：单向流转 `0 未铸造 → 1 铸造中 → 2 已铸造`；超时情况下 `1 → 0` 仅由熔断 Cron 回退。
2. **幂等与并发安全**：所有 RPC 使用 `request_id` 抢占 + 行锁；同一 `user_items` 实例同一时刻仅允许一条铸造中记录。
3. **现有表零破坏**：优先新增表/字段，不改现有 RPC 返回结构；不破坏 `user_items.UNIQUE(user_id, item_id)` 的聚合数量模型。
4. **NFT 单实例性**：NFT 是**每张独立**的资产，与 `user_items.quantity` 聚合模型冲突。方案：新增"NFT 铸造实例表"承载每一次铸造的独立记录，保留 `user_items` 作为中心化库存计数来源。
5. **链上元数据不可变**：`ipfs_metadata_uri`、`collection_address`、`nft_item_address` 一经写入即视为不可变（由触发器守卫）。
6. **Service Role + 应用层鉴权**：延续现有模型，禁止客户端直接写入这些表；所有入口统一经 Server Action / API Route 验签。

---

## 1. 整体表结构变更总览

| 类别 | 变更 | 对象 | 说明 |
|------|------|------|------|
| 新增表 | ✅ | `public.user_ton_wallets` | 玩家绑定的 TON 钱包 |
| 新增表 | ✅ | `public.nft_collections` | NFT 集合（Collection）主数据 |
| 新增表 | ✅ | `public.item_nft_metadata` | 每个 `items.id` 对应的链上元数据与 IPFS URI |
| 新增表 | ✅ | `public.nft_mint_requests` | 铸造请求幂等 + 签名 payload 流水 |
| 新增表 | ✅ | `public.user_item_nfts` | NFT 铸造实例（每行 = 一张 NFT） |
| 新增表 | ✅ | `public.nft_chain_events` | 链上回调/轮询原始事件审计 |
| 修改表 | ⚠️ | `public.items` | 标记哪些物品允许铸造、稀有度阈值 |
| 修改表 | ⚠️ | `public.user_items` | 新增"铸造中锁定数量"字段 |
| 新增 RPC | ✅ | `request_mint_nft_secure` | 3.2 请求铸造（幂等 + 锁定） |
| 新增 RPC | ✅ | `confirm_mint_nft_secure` | 3.3 链上确认（幂等 + 状态结算） |
| 新增 RPC | ✅ | `expire_stale_mint_requests` | 3.4 熔断回滚（Cron 定时） |

---

## 2. 新增表详细设计

### 2.1 `public.user_ton_wallets`（玩家 TON 钱包绑定）

**场景说明**：第四阶段前端 TON Connect 2.0 绑定的钱包地址；后端铸造时用作 `owner_address` 并验证请求者身份一致。

| 列名 | 类型 | 属性 | 默认值 | 检查/约束 | 说明 |
|------|------|------|--------|-----------|------|
| `id` | uuid | PK | `gen_random_uuid()` | — | — |
| `user_id` | uuid | not null | — | FK → `users.id` | — |
| `telegram_id` | bigint | not null | — | FK 冗余快照 | 便于审计 |
| `wallet_address` | text | not null | — | CHECK: 长度 48–68，正则 `^[A-Za-z0-9_-]{48,68}$` | TON 地址（Raw 或 Bounceable 统一大小写） |
| `wallet_chain` | text | not null | `'ton-mainnet'` | CHECK IN (`ton-mainnet`, `ton-testnet`) | — |
| `is_primary` | boolean | not null | `true` | — | 多钱包时标记主钱包 |
| `public_key` | text | nullable | — | — | TON Connect 回传的 `publicKey`（用于签名校验） |
| `first_bound_at` | timestamptz | not null | `now()` | — | — |
| `last_active_at` | timestamptz | not null | `now()` | — | — |
| `unbound_at` | timestamptz | nullable | — | — | 软解绑 |

**索引与约束**：
- `uq_user_ton_wallets_user_wallet_active`：`UNIQUE (user_id, wallet_address) WHERE unbound_at IS NULL` —— 同用户不可重复绑定同一活跃钱包（**partial unique index**）
- `uq_user_ton_wallets_primary_wallet_unique`：`UNIQUE (wallet_address) WHERE is_primary = true AND unbound_at IS NULL` —— 一个地址只能作为一个玩家的主钱包（防多号共用，**partial unique index**）
- `user_ton_wallets_user_id_idx`：`INDEX (user_id)` —— 常用按用户回查钱包列表
- （远程现状）本表目前无 `updated_at` 列，因此也没有 `set_updated_at` 触发器

---

### 2.2 `public.nft_collections`（NFT 集合主数据）

**场景说明**：对应第一阶段已部署的 Collection 合约；未来可能扩展更多系列。

| 列名 | 类型 | 属性 | 默认值 | 说明 |
|------|------|------|--------|------|
| `id` | uuid | PK | `gen_random_uuid()` | — |
| `collection_key` | text | not null unique | — | 业务层引用键（如 `blindbox_s1`） |
| `collection_address` | text | not null unique | — | 链上合约地址，如 `EQCqzvnOjeJG2-...` |
| `chain` | text | not null | `'ton-mainnet'` | — |
| `name` | text | not null | — | — |
| `description` | text | nullable | — | — |
| `cover_uri` | text | nullable | — | IPFS `ipfs://...` |
| `royalty_basis_points` | integer | not null | `500` | CHECK 0–10000，500=5% |
| `royalty_address` | text | not null | — | 版税收款钱包 |
| `mint_authority_address` | text | not null | — | 有铸造权限的管理员钱包 |
| `is_active` | boolean | not null | `true` | — |
| `created_at` | timestamptz | not null | `now()` | — |
| `updated_at` | timestamptz | not null | `now()` | — |

---

### 2.3 `public.item_nft_metadata`（物品 → 链上元数据映射）

**场景说明**：每个允许铸造的 `items.id` 对应的 IPFS JSON URI 与稀有属性快照；RPC 生成 Payload 时读取，确保链上内容与后台数据一致。

| 列名 | 类型 | 属性 | 默认值 | 说明 |
|------|------|------|--------|------|
| `id` | uuid | PK | `gen_random_uuid()` | — |
| `item_id` | uuid | not null unique | — | FK → `items.id`，1:1 映射 |
| `collection_id` | uuid | not null | — | FK → `nft_collections.id` |
| `ipfs_metadata_uri` | text | not null | — | `ipfs://<CID>/x.json` |
| `ipfs_image_uri` | text | nullable | — | 冗余图片 CID（审计） |
| `attributes` | jsonb | not null | `'{}'::jsonb` | 稀有度/攻击力等链下快照 |
| `is_mintable` | boolean | not null | `true` | 运营可关闭铸造 |
| `created_at` | timestamptz | not null | `now()` | — |
| `updated_at` | timestamptz | not null | `now()` | — |

**触发器**：更新时守卫 `ipfs_metadata_uri`、`collection_id`、`item_id` 不可变（参考现有 `tg_invite_rewards_update_guard` 模式）。

---

### 2.4 `public.nft_mint_requests`（铸造请求流水 + 幂等）

**场景说明**：玩家每次点击 "Mint as NFT" 产生一条请求；承载服务端生成的 Payload、签名、到期时间、结果状态。对应 3.2 防篡改签名接口。

| 列名 | 类型 | 属性 | 默认值 | 说明 |
|------|------|------|--------|------|
| `id` | uuid | PK | `gen_random_uuid()` | — |
| `user_id` | uuid | not null | — | FK → `users.id` |
| `telegram_id` | bigint | not null | — | 冗余快照 |
| `user_item_id` | uuid | not null | — | FK → `user_items.id`（锁定目标库存行） |
| `item_id` | uuid | not null | — | FK → `items.id`（冗余便于审计） |
| `wallet_id` | uuid | not null | — | FK → `user_ton_wallets.id` |
| `wallet_address` | text | not null | — | 冗余快照，防事后改绑洗账 |
| `collection_id` | uuid | not null | — | FK → `nft_collections.id` |
| `collection_address` | text | not null | — | 冗余快照 |
| `ipfs_metadata_uri` | text | not null | — | 冗余快照（生成 Payload 时定版） |
| `request_id` | uuid | not null | — | **客户端生成的幂等键** |
| `mint_payload_boc` | text | nullable | — | 服务端构造的 BOC base64 |
| `payload_hash` | text | nullable | — | Payload 的 sha256（对账） |
| `admin_signature` | text | nullable | — | 管理员钱包私钥签名（Ed25519 base64） |
| `status` | text | not null | `'pending'` | CHECK IN (`pending`, `signed`, `broadcasted`, `succeeded`, `failed`, `expired`) |
| `failure_reason` | text | nullable | — | — |
| `expires_at` | timestamptz | not null | — | 建议 15 分钟超时（与 3.4 对应） |
| `broadcasted_tx_hash` | text | nullable | — | 前端广播后回填（可选） |
| `confirmed_tx_hash` | text | nullable | — | 监听确认后回填 |
| `nft_item_address` | text | nullable | — | 链上 NFT 地址 |
| `created_at` | timestamptz | not null | `now()` | — |
| `updated_at` | timestamptz | not null | `now()` | — |
| `confirmed_at` | timestamptz | nullable | — | — |

**索引与约束**：
- `UNIQUE (user_id, request_id)` —— 客户端幂等（与 `chest_open_events`、`purchase_orders` 同模式）
- `UNIQUE (user_item_id) WHERE status IN ('pending','signed','broadcasted')` —— **单个库存实例同时只能有一条"进行中"请求**（强约束防并发）
- `UNIQUE (confirmed_tx_hash) WHERE confirmed_tx_hash IS NOT NULL`
- `INDEX (status, expires_at)` —— 支撑 3.4 熔断扫描
- 触发器：`status` 只能向前流转；`request_id`、`user_item_id`、`collection_address`、`ipfs_metadata_uri` 不可变

**状态机**：
```
pending ──签名完成──► signed ──前端广播──► broadcasted ──链上确认──► succeeded
   │                                             │
   ├───────────────过期/取消──────────────────────┤
   ▼                                             ▼
 expired                                       failed
```

---

### 2.5 `public.user_item_nfts`（NFT 实例表）

**场景说明**：每成功铸造一张 NFT 就写入一行；这是"中心化库存 → 去中心化资产"的单向迁移终点。之后该记录作为 NFT 的真实存在证明（与 `user_items.quantity` 聚合计数解耦）。

| 列名 | 类型 | 属性 | 默认值 | 说明 |
|------|------|------|--------|------|
| `id` | uuid | PK | `gen_random_uuid()` | — |
| `user_id` | uuid | not null | — | 首次铸造者（不随二级市场转手变更） |
| `item_id` | uuid | not null | — | FK → `items.id` |
| `collection_id` | uuid | not null | — | FK → `nft_collections.id` |
| `mint_request_id` | uuid | not null unique | — | FK → `nft_mint_requests.id` |
| `nft_item_address` | text | not null unique | — | 链上独立合约地址 |
| `owner_address` | text | not null | — | 首次落地地址；若后续检测到转让可更新 |
| `tx_hash` | text | not null | — | 铸造上链 tx |
| `ipfs_metadata_uri` | text | not null | — | 定版 URI |
| `minted_at` | timestamptz | not null | `now()` | — |
| `last_seen_owner_at` | timestamptz | nullable | — | 轮询/回调更新 |
| `is_burned` | boolean | not null | `false` | 链上销毁同步 |

**说明**：触发器守护 `nft_item_address`、`mint_request_id`、`item_id` 不可变。

---

### 2.6 `public.nft_chain_events`（链上原始事件审计）

**场景说明**：对应 3.3 的 Webhook / 定时轮询回调；所有收到的原始数据先落地再解析，任何后期争议都可回溯。

| 列名 | 类型 | 属性 | 默认值 | 说明 |
|------|------|------|--------|------|
| `id` | uuid | PK | `gen_random_uuid()` | — |
| `source` | text | not null | — | CHECK IN (`tonapi_webhook`, `toncenter_poll`, `manual`) |
| `external_event_id` | text | nullable | — | 第三方事件 id（若有） |
| `collection_address` | text | not null | — | — |
| `nft_item_address` | text | nullable | — | 解析出的 NFT 地址 |
| `tx_hash` | text | not null | — | — |
| `exit_code` | integer | nullable | — | 0=成功；非 0=失败 |
| `raw_payload` | jsonb | not null | `'{}'::jsonb` | 原始 POST / API 响应 |
| `processed` | boolean | not null | `false` | 是否已被 `confirm_mint_nft_secure` 消费 |
| `processed_at` | timestamptz | nullable | — | — |
| `received_at` | timestamptz | not null | `now()` | — |

**索引**：
- `UNIQUE (source, external_event_id) WHERE external_event_id IS NOT NULL` —— 防同一 Webhook 重复推送
- `UNIQUE (tx_hash, nft_item_address)` —— 同一链上事件只认一份（当外部 id 为空时兜底）
- `INDEX (processed, received_at)` —— Cron 扫描未处理事件

---

## 3. 现有表字段修改

### 3.1 `public.items`（新增可铸造控制）

| 列名 | 类型 | 属性 | 默认值 | 说明 |
|------|------|------|--------|------|
| `is_mintable` | boolean | not null | `false` | 是否开放 NFT 铸造（默认关闭，运营审核后开启） |
| `mint_gas_estimate_nano_ton` | bigint | nullable | — | 前端显示预估 gas，单位 nano TON |

> **注意**：IPFS URI 与 attributes **不放在 `items` 表**，而是独立在 `item_nft_metadata` 里，避免污染现有读路径并保留"同一物品可在多个 Collection 铸造"的扩展空间。

### 3.2 `public.user_items`（新增铸造锁定数量）

| 列名 | 类型 | 属性 | 默认值 | 说明 |
|------|------|------|--------|------|
| `locked_for_mint` | integer | not null | `0` | CHECK: `locked_for_mint >= 0 AND locked_for_mint <= quantity` |

**语义**：
- `quantity` 保持原有总持有数量语义不变（兼容开箱/商店已有逻辑）。
- 发起铸造请求时 `locked_for_mint += 1`；铸造成功时同时执行 `quantity -= 1`、`locked_for_mint -= 1` 并写入 `user_item_nfts`；铸造失败/过期时仅 `locked_for_mint -= 1`。
- 新增 CHECK 约束，从库侧防止越界。

> 可选替代方案：为 NFT 候选物品单独拆出 `user_item_instances` 表（每行一份实例）。本方案之所以不这么做，是因为会打穿现有开箱/商店 RPC 的 `UNIQUE (user_id, item_id)` + `quantity + 1` 路径，改造成本过高。通过"锁定列 + 铸造成功后 `quantity--` + `user_item_nfts` 新行"足以表达单实例语义。

---

## 4. RPC 变更（与 3.2 / 3.3 / 3.4 一一对应）

### 4.1 `request_mint_nft_secure`（对应 3.2）

**入参**（Service Role 调用，身份由 Server Action 验签后传入）：
```
p_user_id uuid,           -- 验签后的用户
p_user_item_id uuid,      -- 指定要铸造的库存实例行
p_wallet_id uuid,         -- 已绑定的 TON 钱包
p_request_id uuid,        -- 客户端幂等键
p_payload_boc text,       -- 服务端在应用层构造后传入（签名在 Node.js 完成）
p_payload_hash text,
p_admin_signature text,
p_ipfs_metadata_uri text,
p_collection_id uuid,
p_expires_at timestamptz
```

**业务逻辑**：
1. `INSERT INTO nft_mint_requests (..., status='pending') ON CONFLICT (user_id, request_id) DO NOTHING` —— 抢占幂等。
2. 命中冲突：返回现有记录（与 `open_chest_secure` 同模式）。
3. 锁 `user_items` 行：`SELECT ... FOR UPDATE`；校验 `user_id` 归属、`quantity - locked_for_mint >= 1`。
4. 校验 `items.is_mintable = true` 且 `item_nft_metadata.is_mintable = true`。
5. 校验 `user_ton_wallets` 未解绑且归属一致。
6. 校验 `nft_collections.is_active = true`。
7. 校验**该 `user_item_id` 当前没有 `status IN ('pending','signed','broadcasted')` 的请求**（部分唯一索引已兜底，这里显式拒绝给出语义错误）。
8. `UPDATE user_items SET locked_for_mint = locked_for_mint + 1`。
9. 回填 `nft_mint_requests.status = 'signed'` + Payload/签名/过期时间。
10. 返回给应用层 `{ collection_address, payload_boc, admin_signature, expires_at }`，由 Server Action 传给前端去 TON Connect。

### 4.2 `confirm_mint_nft_secure`（对应 3.3）

**入参**：由 Webhook 解析或 Cron 轮询得到的数据。
```
p_mint_request_id uuid,
p_tx_hash text,
p_nft_item_address text,
p_owner_address text,
p_exit_code int,
p_chain_event_id uuid
```

**业务逻辑**（全部在单事务）：
1. 锁 `nft_mint_requests` 目标行；若 `status = 'succeeded'` 直接返回幂等成功（带现有 NFT 地址）。
2. `exit_code != 0`：`status = 'failed'` + 写 `failure_reason`，走失败分支（见 4.3）。
3. 成功路径：
   - `UPDATE nft_mint_requests SET status='succeeded', confirmed_tx_hash, nft_item_address, confirmed_at`。
   - 锁 `user_items` 行：`quantity -= 1`、`locked_for_mint -= 1`。若 `quantity` 已为 0（异常数据）则 RAISE。
   - `INSERT INTO user_item_nfts (...)`；`UNIQUE (nft_item_address)` 兜底。
   - `UPDATE nft_chain_events SET processed = true, processed_at = now() WHERE id = p_chain_event_id`。
4. 返回 `{ success, nft_item_address }`。

### 4.3 `expire_stale_mint_requests`（对应 3.4，Cron 每 1 分钟）

```
(无入参) returns table(expired_request_id uuid, req_user_item_id uuid)
```

**业务逻辑**：
1. `FOR UPDATE SKIP LOCKED` 取出 `status IN ('pending','signed','broadcasted') AND expires_at < now()` 的记录。
2. 对每条：
   - 先置 `status = 'expired'`、写 `failure_reason='timeout'`。
   - `UPDATE user_items SET locked_for_mint = locked_for_mint - 1 WHERE id = req_user_item_id` 并断言 ≥ 0。
3. 返回被回滚的列表，供应用层可选地再做一次"链上兜底查询"（若链上其实已成功，走 3.3 的 `confirm_mint_nft_secure`，它能幂等地把 expired 修正为 succeeded —— **需要在确认 RPC 中明确允许 `expired → succeeded` 的回捞**，否则遵循严格单向流转可选择保留 expired 并人工介入）。

> **决策点**：默认建议"允许 expired → succeeded 的回捞"，因为链上真实成功比数据库一致性更重要；同时在状态机文档中写清这是唯一的例外。

---

## 5. 安全与应用层要求（非 SQL 范围，但须一同落实）

1. **严禁**在任何 Client Component / `"use client"` 文件中引用 `nft_*` 表或新增 RPC；所有入口通过 `createAdminClient()`。
2. 每个 Server Action / API Route 入口**必须**先调用 `validateTelegramWebAppData(initData)`，并以验签返回的 `user.id` 作为 `p_user_id`；**严禁**信任前端传入的 `wallet_address`（由 `p_wallet_id` 在库侧反查）。
3. **管理员私钥**（用来对 Payload 进行 Ed25519 签名）只能以环境变量形式存在，例如 `TON_MINT_ADMIN_SECRET`，**不得**进入 `NEXT_PUBLIC_*` 命名空间或前端打包。
4. 所有新增 RPC 必须用 `zod` 在入口校验 `request_id`、`user_item_id`、`wallet_id` 等 uuid 合法性。
5. 新增路径使用 `check_and_increment_rate_limit` 做限流（例如"同一 telegram_id 60 秒内最多 3 次 mint 请求"）。
6. 成功/失败后调用 `revalidateGameRoot()`（见 `lib/revalidate-game.ts`）。

---

## 6. 迁移落地顺序（建议）

1. **Migration 1**：新增 `nft_collections`、`item_nft_metadata` —— 纯主数据表，可先上线不影响现有流程。
2. **Migration 2**：`items.is_mintable`、`user_items.locked_for_mint` 字段 + CHECK 约束。
3. **Migration 3**：新增 `user_ton_wallets`（此时前端 TON Connect 可先行联调绑定）。
4. **Migration 4**：新增 `nft_mint_requests`、`user_item_nfts`、`nft_chain_events`（含索引与守卫触发器）。
5. **Migration 5**：新增 3 个 RPC + 客户端 `EXECUTE` 权限。
6. **种子数据**：写入首个 Collection（`blindbox_s1` + `EQCqzvnOjeJG2-...`）、为第二阶段已上传的 IPFS JSON 物品写入 `item_nft_metadata`、把目标 `items.is_mintable` 开为 `true`。
7. **Cron**：注册 `expire_stale_mint_requests` 每分钟运行（Vercel Cron 或 Supabase pg_cron）。
8. **运行 `supabase gen types`** 更新 `types/supabase.ts`，再开始写 Server Action 与 API Route。

---

## 7. 风险与未决问题

| 风险 | 说明 | 建议 |
|------|------|------|
| `user_items.quantity` 聚合 vs NFT 单实例 | 现有开箱 RPC 会把同 `item_id` 合并累加，无法区分"哪一张"被铸造 | 采用方案 A：`locked_for_mint` 列 + 铸造时 `quantity--`（简单、对现有 RPC 零改造）；若后续出现"道具升级/附魔"等需要区分实例的功能，再拆 `user_item_instances` 表 |
| `expired → succeeded` 回捞 | 严格单向流转 vs 链上真实成功 | 默认允许，代码里必须有明确注释 `// 安全：允许链上真实成功回捞 expired` |
| Webhook 可重放 | TonAPI 等 Webhook 可能被恶意伪造 | `nft_chain_events` 必须校验来源签名（Webhook secret）后再入库，入库仅做原始审计 |
| 管理员私钥泄露 | 泄露即可无限铸造 | 仅后端环境变量；**不要**放入 `vercel env pull` 到本地；定期轮换并更新合约中的 `mint_authority_address` |
| 同一钱包切号 | 玩家 A 解绑后玩家 B 绑定同一地址 | 由 `UNIQUE (wallet_address) WHERE is_primary AND unbound_at IS NULL` 部分索引控制；业务层确认是否允许 |

---

## 8. 与现有 RPC 的兼容性核对

| 现有 RPC | 受影响 | 说明 |
|----------|--------|------|
| `open_chest_secure` / `open_chest_batch_secure` | ⚠️ 读路径不变，写路径需注意 | `ON CONFLICT (user_id, item_id) DO UPDATE SET quantity = quantity + 1` —— 新增 `locked_for_mint` 默认 `0`，不冲突；但需确保 `quantity` 永远 `>= locked_for_mint`（CHECK 已覆盖） |
| `shop_purchase` | ✅ 同上 | 仅 `quantity` 增，不影响锁定 |
| `execute_asset_transaction` | ✅ | 只动 `balance` / `stars`，无关 |
| `accept_invite_and_reward` | ✅ | 同上 |

---

**文档维护**：每次新增或调整 NFT 相关表/RPC 后，必须同步更新本文件与 `DB_TABLES.md` / `RPC_FUNCTIONS.md`，并运行 `supabase gen types` 刷新 TypeScript 类型。
