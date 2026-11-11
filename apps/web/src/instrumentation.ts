/**
 * Runs once when the server starts (`next dev`, `next start`, Vercel).
 * Importing the env modules validates them, so a missing or invalid
 * setting stops the server immediately with a clear message.
 */
export async function register() {
  await import("./env/server");
  await import("./env/client");
}
