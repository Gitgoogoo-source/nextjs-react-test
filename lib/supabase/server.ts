import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import 'server-only';

export function createSupabaseServerClient() {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      !supabaseUrl
        ? 'SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) is not set'
        : 'SUPABASE_ANON_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY) is not set'
    );
  }

  const cookieStore = cookies();

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // 在某些 RSC/Route 场景里 cookies 可能是只读的；此时忽略即可
        }
      },
    },
  });
}

