import 'server-only';

import { NextResponse } from 'next/server';
import type { ActionResult } from '@/lib/action-result';

/** 成功：{ success: true, data }，默认 200 */
export function jsonActionOk<T>(data: T, init?: ResponseInit) {
  const body: ActionResult<T> = { success: true, data };
  return NextResponse.json(body, { status: 200, ...init });
}

/** 失败：{ success: false, error } */
export function jsonActionErr(error: string, status: number, init?: ResponseInit) {
  const body: ActionResult<never> = { success: false, error };
  return NextResponse.json(body, { status, ...init });
}

/** 失败且附带 data（如幂等冲突时的 RPC 快照，便于前端展示/调试） */
export function jsonActionErrData<T>(error: string, status: number, data: T, init?: ResponseInit) {
  const body: ActionResult<T> = { success: false, error, data };
  return NextResponse.json(body, { status, ...init });
}
