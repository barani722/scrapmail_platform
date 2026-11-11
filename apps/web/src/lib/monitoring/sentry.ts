import type * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

/**
 * Shared Sentry options for browser, Node.js and Edge runtimes.
 * Sentry stays fully disabled until NEXT_PUBLIC_SENTRY_DSN is set.
 */
export const sentryOptions = {
  dsn,
  enabled: Boolean(dsn),
  // "production" / "preview" on Vercel, "development" locally.
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? "development",
  // Sample 10% of requests for performance tracing; errors are always sent.
  tracesSampleRate: 0.1,
  // Never attach IP addresses, cookies or user details automatically.
  sendDefaultPii: false,
} satisfies Parameters<typeof Sentry.init>[0];
