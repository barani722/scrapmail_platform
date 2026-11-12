import { Building2, Layers, Mail, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { AnimatedNumber } from "@/components/app/animated-number";
import { TableFrame } from "@/components/app/data-table";
import {
  JobProgress,
  type JobStatus,
  JobStatusBadge,
} from "@/components/app/job-status";
import { LiveRefresh } from "@/components/app/live-refresh";
import { EmptyState } from "@/components/app/page-header";
import { requireWorkspace } from "@/lib/auth/workspace";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Dashboard" };

type Job = {
  id: string;
  title: string;
  status: JobStatus;
  total_tasks: number;
  done_tasks: number;
  failed_tasks: number;
};

export default async function DashboardPage() {
  const { profile, workspaceId } = await requireWorkspace();
  const isAdmin = profile.platform_role === "admin";
  const firstName = (profile.full_name || profile.email).split(" ")[0];
  const supabase = await createClient();

  const head = { count: "exact" as const, head: true };
  const [agencies, contacts, activeJobs, pending, recent] = await Promise.all([
    supabase
      .from("agencies")
      .select("id", head)
      .eq("workspace_id", workspaceId),
    supabase
      .from("agency_contacts")
      .select("id", head)
      .eq("workspace_id", workspaceId)
      .or("email_status.is.null,email_status.eq.valid"),
    supabase
      .from("scrape_jobs")
      .select("id", head)
      .eq("workspace_id", workspaceId)
      .in("status", ["queued", "running"]),
    isAdmin
      ? supabase
          .from("profiles")
          .select("user_id", head)
          .eq("status", "pending")
      : Promise.resolve({ count: 0 }),
    supabase
      .from("scrape_jobs")
      .select("id, title, status, total_tasks, done_tasks, failed_tasks")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(5)
      .returns<Job[]>(),
  ]);

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
            Welcome back, {firstName}!
          </h1>
          <p className="mt-2 text-lg text-muted-foreground">
            Here&apos;s an overview of your Scrap&amp;Mail activity.
          </p>
        </div>
        <LiveRefresh
          tables={isAdmin ? ["scrape_jobs", "profiles"] : ["scrape_jobs"]}
          workspaceId={workspaceId}
          minIntervalMs={5000}
        />
      </div>

      <div className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Building2}
          label="Total Agencies"
          value={agencies.count}
          href="/agencies"
        />
        <StatCard
          icon={Mail}
          label="Email Contacts"
          value={contacts.count}
          href="/contacts"
        />
        <StatCard
          icon={Layers}
          label="Active Scraping Jobs"
          value={activeJobs.count}
          href="/scraping-jobs"
        />
        {isAdmin && (
          <StatCard
            icon={ShieldCheck}
            label="Pending Approvals"
            value={pending.count}
            href="/admin/users"
          />
        )}
      </div>

      <section className="mt-10">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold">Recent Scraping Jobs</h2>
          <Link
            href="/scraping-jobs"
            className="font-medium text-primary hover:underline"
          >
            View all
          </Link>
        </div>
        {!recent.data?.length ? (
          <EmptyState
            title="No scraping jobs yet"
            text="Start an enrichment job on the Scraping Jobs page."
          />
        ) : (
          <TableFrame>
            <table className="w-full text-left text-sm">
              <thead className="bg-muted text-muted-foreground">
                <tr>
                  <th className="px-5 py-3 font-medium">Job</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Progress</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {recent.data.map((job) => (
                  <tr
                    key={job.id}
                    className="transition-colors hover:bg-muted/50"
                  >
                    <td className="px-5 py-4 font-medium">{job.title}</td>
                    <td className="px-5 py-4">
                      <JobStatusBadge status={job.status} />
                    </td>
                    <td className="px-5 py-4">
                      <JobProgress
                        done={job.done_tasks}
                        failed={job.failed_tasks}
                        total={job.total_tasks}
                        running={job.status === "running"}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableFrame>
        )}
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
  value: number | null;
  href: string;
}) {
  return (
    <Link href={href} className="group">
      <div className="h-full rounded-xl border bg-card p-6 shadow-sm transition-all duration-200 group-hover:-translate-y-0.5 group-hover:border-primary/40 group-hover:shadow-md">
        <span className="flex size-12 items-center justify-center rounded-lg bg-accent transition-transform duration-200 group-hover:scale-110">
          <Icon aria-hidden="true" className="size-6 text-primary" />
        </span>
        <p className="mt-4 text-base text-muted-foreground">{label}</p>
        <p className="mt-1 text-4xl font-bold tracking-tight">
          <AnimatedNumber value={value ?? 0} />
        </p>
      </div>
    </Link>
  );
}
