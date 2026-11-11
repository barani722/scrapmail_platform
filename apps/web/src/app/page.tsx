import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";

/**
 * Temporary placeholder. Replaced by the login / dashboard pages in Milestone 2–3.
 */
export default function HomePage() {
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
        <Button className="mt-8 w-full" size="lg" disabled>
          Sign in (coming soon)
        </Button>
      </div>
    </main>
  );
}
