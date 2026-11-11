import "server-only";

import { clientEnv } from "@/env/client";

export type SupabaseHealth =
  { ok: true; authVersion: string } | { ok: false; reason: string };

/**
 * Check that the configured Supabase project is reachable and accepts our key.
 * Calls the Auth service health endpoint; no database tables are needed.
 */
export async function checkSupabaseHealth(): Promise<SupabaseHealth> {
  try {
    const response = await fetch(
      `${clientEnv.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/health`,
      {
        headers: { apikey: clientEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY },
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
      },
    );

    if (!response.ok) {
      return { ok: false, reason: `HTTP ${response.status}` };
    }

    const body = (await response.json()) as { version?: string };
    return { ok: true, authVersion: body.version ?? "unknown" };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
