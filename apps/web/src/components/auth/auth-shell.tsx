import { Building2, Mail, Search, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";

import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";

type AuthShellProps = {
  headline: string;
  description: string;
  children: ReactNode;
};

/** Two-column auth layout from the login / registration designs. */
export function AuthShell({ headline, description, children }: AuthShellProps) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)]">
      <aside className="hidden flex-col bg-brand-surface px-12 py-16 lg:flex">
        <Logo />
        <div className="mt-24 max-w-md">
          <h1 className="text-5xl leading-tight font-bold tracking-tight">
            {headline}
          </h1>
          <p className="mt-6 text-xl leading-relaxed text-muted-foreground">
            {description}
          </p>
        </div>
        <Illustration />
      </aside>

      <main className="relative flex items-center justify-center px-4 py-16 sm:px-8">
        <ThemeToggle className="absolute top-4 right-4" />
        <div className="w-full max-w-xl animate-in duration-500 fade-in slide-in-from-bottom-3">
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>
          <div className="rounded-2xl border bg-card p-6 shadow-sm sm:p-10">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}

export function SecureNote({ title }: { title: string }) {
  return (
    <div className="mt-8 flex items-start gap-3 rounded-lg bg-muted px-5 py-4 text-sm">
      <ShieldCheck
        aria-hidden="true"
        className="mt-0.5 size-5 shrink-0 text-muted-foreground"
      />
      <p>
        <span className="font-semibold">{title}:</span> Your information is
        encrypted and protected.
      </p>
    </div>
  );
}

function Illustration() {
  return (
    <div aria-hidden="true" className="relative mt-auto h-72 max-w-lg">
      <div className="absolute inset-x-12 top-8 bottom-6 rounded-2xl border-8 border-foreground/70 bg-card p-6 shadow-sm">
        {[0, 1, 2].map((row) => (
          <div key={row} className="mb-4 flex items-center gap-4">
            <span className="flex size-10 items-center justify-center rounded-lg bg-muted">
              <Building2 className="size-5 text-muted-foreground" />
            </span>
            <span className="h-2.5 w-2/3 rounded-full bg-border" />
          </div>
        ))}
      </div>
      <span className="absolute top-36 left-0 flex size-20 items-center justify-center rounded-2xl bg-card shadow-md">
        <Search className="size-9 text-primary" />
      </span>
      <span className="absolute top-0 right-4 flex size-24 items-center justify-center rounded-2xl bg-card shadow-md">
        <Mail className="size-11 text-primary" />
      </span>
    </div>
  );
}
