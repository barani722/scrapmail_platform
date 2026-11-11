import { createBrowserClient } from "@supabase/ssr";

import { clientEnv } from "@/env/client";

/**
 * Supabase client for Client Components (runs in the browser).
 * Uses the publishable key only; data access is enforced by RLS.
 */
export function createClient() {
  return createBrowserClient(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    clientEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}
