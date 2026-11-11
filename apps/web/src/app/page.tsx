import { connection } from "next/server";

import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { checkSupabaseHealth } from "@/lib/supabase/health";

/**
 * Temporary placeholder. Replaced by the login / dashboard pages in Milestone 2–3.
 */
export default async function HomePage() {
  // Render on every request so the connection status is always current.
  await connection();
  const supabase = await checkSupabaseHealth();

  return (
    <main className="flex min-h-dvh items-center justify-center bg-brand-surface px-4">
      <div className="w-full max-w-md rounded-xl border bg-card p-8 shadow-sm">
        <Logo />
        <h1 className="mt-8 text-2xl font-bold tracking-tight">
          Platform setup in progress
        </h1>
        <p className="mt-2 text-muted-foreground">
          The web application foundation is running. Sign-in and the dashboard
          will be added in the next milestones.
        </p>

        <div className="mt-6 flex items-center gap-2 rounded-lg bg-muted px-4 py-3 text-sm">
          <span
            aria-hidden="true"
            className={`size-2.5 rounded-full ${supabase.ok ? "bg-green-600" : "bg-destructive"}`}
          />
          {supabase.ok ? (
            <span>
              Supabase: <strong>connected</strong>
            </span>
          ) : (
            <span>
              Supabase: <strong>not connected</strong> ({supabase.reason})
            </span>
          )}
        </div>

        <Button className="mt-8 w-full" size="lg" disabled>
          Sign in (coming soon)
        </Button>
      </div>
    </main>
  );
}
