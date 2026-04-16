import { createBrowserClient } from '@supabase/ssr';

export function createSupabaseBrowserClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      !supabaseUrl
        ? 'NEXT_PUBLIC_SUPABASE_URL is not set'
        : 'NEXT_PUBLIC_SUPABASE_ANON_KEY is not set'
    );
  }

  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}

