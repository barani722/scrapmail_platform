import * as Sentry from "@sentry/nextjs";

/**
 * Runs once when the server starts (`next dev`, `next start`, Vercel).
 * 1. Importing the env modules validates them, so a missing or invalid
 *    setting stops the server immediately with a clear message.
 * 2. Starts error monitoring (no-op until a Sentry DSN is configured).
 */
export async function register() {
  await import("./env/server");
  await import("./env/client");

  const { sentryOptions } = await import("./lib/monitoring/sentry");
  Sentry.init(sentryOptions);
}

// Report errors thrown while rendering Server Components / route handlers.
export const onRequestError = Sentry.captureRequestError;
