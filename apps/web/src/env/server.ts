import "server-only";

import { z } from "zod";

import { parseEnv } from "./parse";

/**
 * Server-only settings (secrets live here).
 * Importing this file from a Client Component fails the build,
 * so these values can never reach the browser.
 */
const schema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  /** Supabase secret key: bypasses RLS. Server-only, never NEXT_PUBLIC_. */
  SUPABASE_SECRET_KEY: z
    .string()
    .startsWith("sb_secret_", "must be a Supabase secret key"),
});

export const serverEnv = parseEnv("server", schema, {
  NODE_ENV: process.env.NODE_ENV,
  SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
});
