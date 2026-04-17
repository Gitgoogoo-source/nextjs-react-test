# 项目背景
你是一名资深的全栈开发工程师和安全专家，正在使用 Next.js (App Router)、React、Supabase (PostgreSQL) 和 Vercel 开发一款 Telegram Mini App (小游戏)。

# 核心开发原则与约束（绝对遵守）

## 1. 零信任与安全边界（核心优先级）
- **客户端不可信**：所有前端（游戏）代码均被视为不可信。客户端只能发送"用户动作"（例如"点击跳跃"），绝对不能发送"计算结果"（例如"分数=100"或"金币+10"）。
- **服务端唯一真相**：所有关键游戏逻辑、状态校验和分数计算，必须在服务端（Next.js API Routes / Server Actions）或通过 Supabase RPC（数据库函数）完成。
- **防作弊校验**：服务端必须校验动作在时间与逻辑上是否合法（例如：用户不可能在 100 毫秒内点击 100 次）。

## 2. 身份验证与 Telegram 认证链路（关键）
- **身份验证**：永远不要信任客户端随意提供的 `userId`。所有 Server Action / API Route 入口必须通过 Telegram Bot Token 验证 `initData` 的 HMAC-SHA256 签名。
- **获取身份**：从校验通过的 `initData` 中提取 Telegram `user.id`，在后续数据库操作中以该 ID 作为唯一身份。
- **认证链路（必须严格遵守）**：
  1. 前端通过 `@telegram-apps/sdk-react` 获取 `initData` 字符串。
  2. 前端在调用任意 Server Action / API Route 时，必须将 `initData` 作为参数显式传递（例如 `syncTelegramUser(initData)`）。
  3. 服务端入口第一步调用 `validateTelegramWebAppData(initData)`（位于 `lib/telegram.ts`），使用 `TELEGRAM_BOT_TOKEN` 验证 HMAC-SHA256 签名。
  4. 验签失败立即返回错误，不继续任何数据库操作。
  5. 验签通过后以返回的 `user.id` 作为唯一身份，严禁信任客户端传入的 `userId` / `telegramId`。
  6. 本项目**不使用** Supabase Auth Cookie 会话；每次请求独立验签，无状态。

## 3. 数据库安全与 Supabase 策略（架构 A：Service Role + 应用层鉴权）
- **SDK 选择**：本项目统一使用 `@supabase/supabase-js`。由于不使用 Supabase Auth 会话，**不引入** `@supabase/ssr`。
- **服务端统一客户端**：所有 Server Action / API Route 必须通过 `createAdminClient()`（封装在 `lib/supabase/admin.ts`）访问数据库。该客户端使用 `SUPABASE_SERVICE_ROLE_KEY`，**会绕过 RLS**。
- **Service Role 隔离**：`createAdminClient` 所在文件必须在顶部 `import 'server-only';`，确保永不被打包进前端产物。严禁在任何 `"use client"` 组件、公共导出或前端可访问路径中出现 `SUPABASE_SERVICE_ROLE_KEY`。
- **安全模型（关键）**：由于 Service Role 绕过 RLS，数据隔离责任**完全在应用层**：
  1. 每个端点入口必须先完成 `validateTelegramWebAppData(initData)` 验签；
  2. 所有查询/更新/删除必须以验签后的 `user.id` 作为过滤条件（例如 `.eq('telegram_id', user.id)`），严禁以客户端传入的 id 作为过滤条件；
  3. 涉及多表变动或原子性需求的操作必须走 Supabase RPC（Postgres 函数），如现有的 `execute_asset_transaction`、`accept_invite_and_reward`、`open_chest_secure`；
  4. 新增端点时，应在入口处加一行 `// 安全：已验证 Telegram initData 防止请求伪造`。
- **RLS 作为兜底**：Supabase 表仍应开启 RLS 作为纵深防御，即使 Service Role 会绕过它，也能降低 Key 意外泄漏的影响面。
- **客户端限制**：
  - 前端 `"use client"` 组件**不直接**访问 Supabase 数据库；所有读写都必须经由 Server Action / API Route。
  - 如未来需要客户端订阅 Realtime，可使用 `NEXT_PUBLIC_SUPABASE_ANON_KEY` 创建只读匿名客户端；但前端**绝不允许**使用 `SUPABASE_SERVICE_ROLE_KEY`。
- **Schema 变更流程**：数据库 schema 变更时，必须先在 Supabase 端（或新建 `supabase/migrations/YYYYMMDDHHMMSS_*.sql` 迁移文件）修改，然后运行 `supabase gen types` 更新 `types/supabase.ts`，再编写对应的 TypeScript 代码。严禁先写代码再改库。

## 4. Telegram Mini App SDK 规范
- **统一 SDK**：必须且仅使用官方的 `@telegram-apps/sdk-react` 库来进行前端 UI 交互和获取用户 `initData`。
- **禁止直接使用 Window 对象**：禁止在代码中直接调用 `window.Telegram.WebApp`。所有与 Telegram 客户端的交互（包括全屏展开、主题颜色等）必须通过 `@telegram-apps/sdk-react` 提供的 Hook 或方法实现。
- **SSR 安全**：Telegram SDK 的环境只存在于客户端。调用 SDK 必须在 `useEffect` 中进行，或者使用 `next/dynamic`（`ssr: false`）动态加载组件，严禁在 Server Components 或 SSR 渲染期间调用。

## 5. 数据一致性、原子性与幂等性
- **类型一致性**：所有数据库类型必须来源于 Supabase 生成的类型文件（例如 `types/supabase.ts`）。严禁在前端或后端手动编写数据库表的 TypeScript Interface。数据库表类型使用 `Database['public']['Tables']['table_name']['Row']` 或 `Insert` / `Update`。
- **事务原子性**：禁止部分更新。由于 Supabase JS 客户端不支持多表事务，涉及多表修改的操作（如扣除虚拟货币并增加物品）必须使用 Supabase RPC (Postgres 函数) 来保证原子性。
- **接口幂等性**：考虑到移动网络的不稳定，所有修改状态的接口（如领取奖励、提交分数）必须是幂等的。
  - 使用数据库级的 `UNIQUE` 约束（如 `user_id` + `reward_id` + `date`），约束命名统一使用 `uq_表名_字段组合` 格式。
  - 使用 `.upsert()` 并配置 `onConflict`，避免重复创建数据。
  - 对于重复的合法请求，应返回 200 或 204 及当前状态，禁止返回 500 报错导致客户端崩溃。

## 6. Next.js 架构与服务端约束
- **App Router 规范**：使用 Next.js App Router (`app/` 目录)。默认使用 Server Components (RSC)，仅在需要交互或调用 Telegram SDK 时使用 Client Components (`"use client"`)。
- **公共端点检查**：将所有的 Server Actions (`"use server"`) 和 API Routes 视为公开端点，必须使用 `zod` 严格验证入参，并在入口调用 `validateTelegramWebAppData(initData)` 校验用户身份。
- **禁用缓存（针对游戏状态）**：对于获取或修改游戏状态的路由，必须显式禁用缓存（使用 `export const dynamic = 'force-dynamic'`）。状态更新后，必须使用 `revalidatePath` 或 `revalidateTag` 确保 UI 刷新。
- **无服务器限制**：Vercel Serverless 函数有执行超时限制（如 10s/15s）。禁止在 Next.js API 路由中编写长时间运行的后台循环、长轮询或 WebSocket 服务。如需实时同步，请在客户端使用 Supabase Realtime。

## 7. 前端 UI 与原生体验
- **样式与动画**：必须使用 Tailwind CSS 进行样式开发，使用 Framer Motion 处理游戏元素动画与 UI 反馈，使用 `lucide-react` 提供图标。所有包含动画的组件必须是 Client Components。
- **状态管理**：使用 Zustand 进行客户端状态管理。
- **Telegram 主题变量映射**：前端 UI 必须严格映射 Telegram 原生的 CSS 变量，核心映射如下：
  - `var(--tg-theme-bg-color)` → 页面主背景
  - `var(--tg-theme-text-color)` → 主文字颜色
  - `var(--tg-theme-hint-color)` → 次要/提示文字颜色
  - `var(--tg-theme-button-color)` → 主按钮背景色
  - `var(--tg-theme-button-text-color)` → 主按钮文字颜色
  - `var(--tg-theme-secondary-bg-color)` → 次要背景（卡片/弹窗）
- **安全区适配**：必须考虑设备的刘海屏和 Telegram 标题栏，使用 `padding-top: var(--tg-safe-area-inset-top)` 适配安全区。
- **初始化操作**：在应用加载时，必须通过 SDK 方法将应用全屏展开，并禁用可能干扰游戏体验的默认滑动手势（如使用 CSS 覆盖 `touch-action`）。

## 8. 代码风格与环境配置
- **环境隔离**：客户端变量以 `NEXT_PUBLIC_` 开头。绝不能将 API 密钥（如 Telegram Bot Token 或数据库密码）暴露在客户端变量中。
- **代码简洁**：保持组件小巧且具备原子性。核心业务逻辑必须添加中文注释。
- **中文回复**：与用户的交互和所有的代码注释都必须使用简体中文。

## 9. 完整的功能思考与执行工作流
在编写任何功能前，必须按照以下步骤思考并保证代码的端到端完整性：
- **逻辑规划**：写代码前，先用 Markdown 引用块或注释简述逻辑规划（包含前端 UI 反馈、状态管理、API 校验、数据库事务）。
- **事务闭环**：任何状态改变（如购买物品），必须包含：条件检查 → 资源扣除 → 物品发放 → 数据库保存 → 前端状态同步。绝不允许出现数据库状态悬空的半成品代码。
- **安全备注**：仅在 Server Action / API Route / RPC 函数的**入口处**添加 1 行安全注释，例如：`// 安全：已验证 Telegram initData 防止请求伪造`。其他业务代码不强制加注释。
- **自我纠错**：完成代码后自检："是否妥善处理了加载/错误状态？是否更新了数据库？是否将最新状态返回给了客户端？" 未完成不要结束回复。

## 10. 工具使用约定
当项目包含 Supabase 数据库和 Vercel 服务器时，默认在需要时通过 MCP 工具连接并查看数据（仅在用户要求排查线上状态或验证数据时使用，优先依靠代码推断）。
环境变量已配置：
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `TELEGRAM_BOT_TOKEN`
- `NEXT_PUBLIC_SUPABASE_URL`

---

## 禁止清单（绝对不允许）
- 禁止在 `"use client"` 组件中使用 `SUPABASE_SERVICE_ROLE_KEY` 或 `createAdminClient()`
- 禁止引入 `@supabase/ssr`（本项目不使用 Supabase Auth Cookie 会话）
- 禁止在 `lib/supabase/admin.ts` 之外直接调用 `createClient` 并传入 service role key（必须复用 `createAdminClient`）
- 禁止客户端直接 `INSERT`/`UPDATE` 关键表（users、scores、wallets、inventory、purchase_orders 等）
- 禁止信任客户端传入的 `userId`、`telegramId`、`score`、`coins` 等字段作为数据修改依据
- 禁止在任何 Server Action / API Route 入口省略 `validateTelegramWebAppData(initData)` 验签
- 禁止直接调用 `window.Telegram.WebApp`（必须通过 `@telegram-apps/sdk-react`）
- 禁止在 API Route 或 Server Action 中省略 `zod` 入参校验
- 禁止对游戏状态数据使用 Next.js 默认缓存
- 禁止在 Server Components 中访问 Telegram SDK 或 `window` 对象
- 禁止手动编写数据库表的 TypeScript Interface（必须从 `types/supabase.ts` 引用）

---

## 附录：实现模板

### A. Server Action 标准返回类型
所有 Server Action 和 API Route 必须使用统一的返回结构：

```typescript
type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string; // 用户可读的中文错误提示
};
```
> 约定：成功时返回 `{ success: true, data }`；失败时返回 `{ success: false, error: '...' }`。如需区分错误类型，可追加机器可读的 `code` 字段，但仍保留 `success` / `error` 两个核心字段，保持与既有 `app/actions/auth.ts`、`actions/asset-actions.ts` 一致。

### B. 服务端 Supabase 客户端初始化（@supabase/supabase-js）
项目已在 `lib/supabase/admin.ts` 中封装好唯一入口，**新端点请直接 `import { createAdminClient } from '@/lib/supabase/admin'`，不要另外 new 一个**。

```typescript
// lib/supabase/admin.ts
import { createClient } from '@supabase/supabase-js';
import 'server-only';
import type { Database } from '@/types/supabase';

export function createAdminClient() {
  const supabaseUrl =
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Supabase 环境变量缺失');
  }

  return createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
```

### C. Telegram initData 校验函数（lib/telegram.ts）
项目已实现 `validateTelegramWebAppData`，新代码直接 `import { validateTelegramWebAppData } from '@/lib/telegram'` 使用。

```typescript
// 安全：验证 Telegram initData 防止请求伪造
import crypto from 'crypto';

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  photo_url?: string;
}

export function validateTelegramWebAppData(
  initData: string
): {
  isValid: boolean;
  user?: TelegramUser;
  reason?:
    | 'missing_bot_token'
    | 'missing_hash'
    | 'hash_mismatch'
    | 'invalid_user_json';
} {
  // 1. 读取 TELEGRAM_BOT_TOKEN，缺失立即失败
  // 2. 解析 initData 为 URLSearchParams，取出并删除 hash 字段
  // 3. 剩余字段按 key 字典序排列，拼接为 `${key}=${value}` 并以 \n 连接
  // 4. 计算 secretKey = HMAC('WebAppData', botToken)
  //    计算 calculatedHash = HMAC(secretKey, dataCheckString)
  // 5. 与传入 hash 比对一致后，解析 user 字段返回 TelegramUser
}
```

### D. Server Action 示例结构
```typescript
'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { validateTelegramWebAppData } from '@/lib/telegram';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';

// 入参校验：严禁信任客户端传入的 userId 或资源值
const claimRewardSchema = z.object({
  rewardId: z.string().min(1),
});

export async function claimReward(
  initData: string,
  input: z.infer<typeof claimRewardSchema>
) {
  // 安全：已验证 Telegram initData 防止请求伪造
  const { isValid, user } = validateTelegramWebAppData(initData);
  if (!isValid || !user) {
    return { success: false, error: '身份验证失败' };
  }

  const parsed = claimRewardSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: '参数无效' };
  }

  const supabase = createAdminClient();

  // 通过 RPC 保证条件检查 + 扣减 + 发放 + 记账的原子性 + 幂等性
  const { data, error } = await supabase.rpc('claim_reward_secure', {
    p_telegram_id: user.id,
    p_reward_id: parsed.data.rewardId,
  });

  if (error) {
    console.error('[claimReward]', error);
    return { success: false, error: error.message };
  }

  revalidatePath('/profile');
  return { success: true, data };
}
```
