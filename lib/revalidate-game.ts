import 'server-only';

import { revalidatePath } from 'next/cache';

/**
 * 游戏状态在服务端变更后，使根路由（/）的 Next.js 数据缓存失效。
 * 当前 UI 以客户端 Zustand + API 回包刷新为主；此函数与规则 §6 对齐，并兼容未来在 RSC 中读库。
 */
export function revalidateGameRoot() {
  revalidatePath('/');
}
