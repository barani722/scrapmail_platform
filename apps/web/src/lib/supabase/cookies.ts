import type { CookieOptions } from "@supabase/ssr";

/** Cookie that stores the "Remember me" choice made at sign-in. */
export const REMEMBER_COOKIE = "sm-remember";

/**
 * Without "Remember me", auth cookies become session cookies:
 * they disappear when the browser is closed.
 */
export function applyRememberChoice(
  options: CookieOptions,
  remember: string | undefined,
): CookieOptions {
  if (remember !== "0") return options;
  return { ...options, maxAge: undefined, expires: undefined };
}
