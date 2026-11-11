import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { clientEnv } from "@/env/client";

import { applyRememberChoice, REMEMBER_COOKIE } from "./cookies";

/**
 * Supabase client for Server Components, Server Actions and Route Handlers.
 * Acts as the signed-in user (session from cookies), so RLS applies.
 * Create a new client per request; never share one between requests.
 */
export async function createClient() {
  const cookieStore = await cookies();
  const remember = cookieStore.get(REMEMBER_COOKIE)?.value;

  return createServerClient(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    clientEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(
                name,
                value,
                applyRememberChoice(options, remember),
              );
            }
          } catch {
            // Called from a Server Component, where cookies are read-only.
            // The request proxy (src/proxy.ts) refreshes sessions instead.
          }
        },
      },
    },
  );
}
