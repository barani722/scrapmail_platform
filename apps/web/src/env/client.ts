import { z } from "zod";

import { parseEnv } from "./parse";

/**
 * Public settings. Safe to use anywhere, including the browser.
 * NEXT_PUBLIC_* values are embedded in the browser bundle: never put secrets here.
 */
const schema = z.object({
  /** Public base URL of the app, e.g. https://app.example.com */
  NEXT_PUBLIC_APP_URL: z.url(),
  /** Supabase project URL, e.g. https://<project-ref>.supabase.co */
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  /** Supabase publishable key (safe for the browser; RLS protects the data). */
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z
    .string()
    .startsWith("sb_publishable_", "must be a Supabase publishable key"),
});

const vercelUrl = process.env.NEXT_PUBLIC_VERCEL_URL;

// Next.js only inlines NEXT_PUBLIC_* variables that are referenced literally,
// so every variable must be listed here explicitly.
export const clientEnv = parseEnv("client", schema, {
  // Vercel preview deployments fall back to their own deployment URL.
  NEXT_PUBLIC_APP_URL:
    process.env.NEXT_PUBLIC_APP_URL ??
    (vercelUrl ? `https://${vercelUrl}` : undefined),
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
});
