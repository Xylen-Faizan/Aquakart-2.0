import { createClient as createSupabaseClient } from '@supabase/supabase-js';

// WARNING: This client bypasses RLS (Row Level Security).
// It should NEVER be imported or used in client components or untrusted server contexts.
// Use this only for secure server-side operations that require admin privileges.

export const createAdminClient = () => {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
};
