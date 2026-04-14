import { createClient } from '@supabase/supabase-js';
import 'server-only';

export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      !supabaseUrl
        ? 'NEXT_PUBLIC_SUPABASE_URL is not set'
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
