import { Building2, Layers, ShieldCheck, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/app/page-header";
import { requireApprovedProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const profile = await requireApprovedProfile();
  const isAdmin = profile.platform_role === "admin";
  const firstName = (profile.full_name || profile.email).split(" ")[0];

  let pendingCount = 0;
  let activeUsers = 0;
  if (isAdmin) {
    const supabase = await createClient();
    const [pending, active] = await Promise.all([
      supabase
        .from("profiles")
        .select("user_id", { count: "exact", head: true })
        .eq("status", "pending"),
      supabase
        .from("profiles")
        .select("user_id", { count: "exact", head: true })
        .eq("status", "approved"),
    ]);
    pendingCount = pending.count ?? 0;
    activeUsers = active.count ?? 0;
  }

  return (
    <>
      <h1 className="text-4xl font-bold tracking-tight">
        Welcome back, {firstName}!
      </h1>
      <p className="mt-2 text-lg text-muted-foreground">
        Here&apos;s an overview of your Scrap&amp;Mail activity.
      </p>

      <div className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Building2} label="Total Agencies" value="—" />
        <StatCard icon={Layers} label="Active Scraping Jobs" value="—" />
        {isAdmin && (
          <>
            <StatCard
              icon={ShieldCheck}
              label="Pending Approvals"
              value={pendingCount.toLocaleString()}
              href="/admin/users"
            />
            <StatCard
              icon={Users}
              label="Active Users"
              value={activeUsers.toLocaleString()}
            />
          </>
        )}
      </div>

      <section className="mt-10">
        <h2 className="mb-4 text-xl font-bold">Recent Scraping Jobs</h2>
        <EmptyState
          title="No scraping jobs yet"
          text="The agency database and scraping engine are the next features to be released."
        />
      </section>
    </>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: typeof Building2;
  label: string;
  value: string;
  href?: string;
}) {
  const body = (
    <div className="h-full rounded-xl border bg-card p-6 transition-colors hover:border-primary/40">
      <span className="flex size-12 items-center justify-center rounded-lg bg-accent">
        <Icon aria-hidden="true" className="size-6 text-primary" />
      </span>
      <p className="mt-4 text-base text-muted-foreground">{label}</p>
      <p className="mt-1 text-4xl font-bold tracking-tight">{value}</p>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}
