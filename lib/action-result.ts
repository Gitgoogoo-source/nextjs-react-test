/**
 * 与 .cursor/rules 附录 A 一致：Server Action 与 JSON API 响应体统一结构。
 * HTTP 状态码仍表示认证/限流/客户端错误等语义；body 内用 success / error 与 Action 对齐。
 */
export type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
  /** 可选：机器可读错误码，便于前端分支；用户提示仍以 error 为准 */
  code?: string;
};
