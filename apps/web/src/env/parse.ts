import { z } from "zod";

/**
 * Validate a set of environment variables against a schema.
 * Throws a readable error listing every missing or invalid variable.
 */
export function parseEnv<T extends z.ZodType>(
  scope: "client" | "server",
  schema: T,
  values: Record<string, string | undefined>,
): z.infer<T> {
  // Treat empty values (`KEY=` in a .env file) as missing.
  const cleaned = Object.fromEntries(
    Object.entries(values).map(([key, value]) => [
      key,
      value === "" ? undefined : value,
    ]),
  );

  const result = schema.safeParse(cleaned);
  if (!result.success) {
    throw new Error(
      `Invalid ${scope} environment variables:\n` +
        `${z.prettifyError(result.error)}\n` +
        "See apps/web/.env.example for the required settings.",
    );
  }
  return result.data;
}
