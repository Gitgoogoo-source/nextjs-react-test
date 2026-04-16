import { createClient } from '@supabase/supabase-js';
import 'server-only';

export function createAdminClient() {
  // 只允许在服务端使用 service role（绕过 RLS / 系统级操作）
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      !supabaseUrl
        ? 'SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) is not set'
        : 'SUPABASE_SERVICE_ROLE_KEY is not set'
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
