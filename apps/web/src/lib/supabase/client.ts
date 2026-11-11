import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | undefined;

/**
 * Supabase client for Client Components (runs in the browser).
 * Uses the publishable key only; data access is enforced by RLS.
 * Values are validated at build/server start (src/env/client.ts); they are
 * read directly here to keep the validation library out of the browser bundle.
 */
export function createClient() {
  browserClient ??= createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
  );
  return browserClient;
}
