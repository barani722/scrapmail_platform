import "server-only";

import { createClient } from "@supabase/supabase-js";

import { clientEnv } from "@/env/client";
import { serverEnv } from "@/env/server";

/**
 * Privileged Supabase client (secret key): bypasses RLS.
 * Only for server-side admin operations after the caller has been verified,
 * e.g. banning a suspended user's sessions in Supabase Auth.
 */
export function createAdminClient() {
  return createClient(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv.SUPABASE_SECRET_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
