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
  // Supabase secret key is added here when Supabase is connected.
});

export const serverEnv = parseEnv("server", schema, {
  NODE_ENV: process.env.NODE_ENV,
});
