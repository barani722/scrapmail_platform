import type { Metadata } from "next";
import Link from "next/link";

import { TableFrame } from "@/components/app/data-table";
import {
  JobProgress,
  type JobStatus,
  JobStatusBadge,
} from "@/components/app/job-status";
import { LiveRefresh } from "@/components/app/live-refresh";
import { EmptyState, PageHeader } from "@/components/app/page-header";
import { requireWorkspace } from "@/lib/auth/workspace";
import { createClient } from "@/lib/supabase/server";

import { CancelJobButton, DiscoveryForm, NewJobForm } from "./job-controls";

export const metadata: Metadata = { title: "Scraping Jobs" };

/** Must match BRAVE_MONTHLY_LIMIT in workers/.env (the worker enforces it). */
const SEARCH_MONTHLY_LIMIT = 950;

type Job = {
  id: string;
  kind: "enrich_websites" | "discover";
  title: string;
  status: JobStatus;
  total_tasks: number;
  done_tasks: number;
  failed_tasks: number;
  created_at: string;
};

type Stats = {
  job_id: string;
  accepted: number;
  rejected: number;
  pending: number;
};

export default async function ScrapingJobsPage() {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();
  const month = new Date().toISOString().slice(0, 7) + "-01";

  const [{ data: jobs }, { data: usage }, { count: linkSites }] =
    await Promise.all([
      supabase
        .from("scrape_jobs")
        .select(
          "id, kind, title, status, total_tasks, done_tasks, failed_tasks, created_at",
        )
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .limit(50)
        .returns<Job[]>(),
      supabase
        .from("search_usage")
        .select("used")
        .eq("provider", "brave")
        .eq("month", month)
        .maybeSingle<{ used: number }>(),
      supabase
        .from("agencies")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspaceId)
        .not("website_url", "is", null)
        .or("website_status.is.null,website_status.eq.ok"),
    ]);

  const discoverIds = (jobs ?? [])
    .filter((j) => j.kind === "discover")
    .map((j) => j.id);
  const statsResult = discoverIds.length
    ? await supabase.rpc("discovery_job_stats", { p_job_ids: discoverIds })
    : { data: [] };
  const stats = new Map(
    ((statsResult.data ?? []) as Stats[]).map((s) => [s.job_id, s]),
  );

  return (
    <>
      <PageHeader
        title="Scraping Jobs"
        description="Find new agencies and collect emails, phone numbers and business details from their websites."
        actions={
          <LiveRefresh
            tables={["scrape_jobs"]}
            workspaceId={workspaceId}
            minIntervalMs={1500}
          />
        }
      />

      <section className="mb-6 rounded-xl border bg-card p-6 shadow-sm">
        <h2 className="text-lg font-bold">Find new agencies</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Every website found is checked against your database (no duplicates),
          visited, and rated for relevance. Only travel, event and ticketing
          businesses are added.
        </p>
        <DiscoveryForm
          searchUsed={usage?.used ?? 0}
          searchLimit={SEARCH_MONTHLY_LIMIT}
          linkSites={linkSites ?? 0}
        />
      </section>

      <section className="mb-8 rounded-xl border bg-card p-6 shadow-sm">
        <h2 className="text-lg font-bold">Update existing agencies</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Visits each agency website (homepage and contact/about pages),
          respects robots.txt, fills empty fields and updates the relevance
          rating. Imported data is never overwritten.
        </p>
        <NewJobForm />
      </section>

      {!jobs?.length ? (
        <EmptyState
          title="No scraping jobs yet"
          text="Start your first job above."
        />
      ) : (
        <TableFrame>
          <table className="w-full text-left text-sm">
            <thead className="bg-muted text-muted-foreground">
              <tr>
                <th className="px-5 py-3 font-medium">Job</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Progress</th>
                <th className="px-5 py-3 font-medium">Started</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {jobs.map((job) => {
                const active =
                  job.status === "queued" || job.status === "running";
                const s = stats.get(job.id);
                return (
                  <tr
                    key={job.id}
                    className="animate-in transition-colors fade-in hover:bg-muted/50"
                  >
                    <td className="px-5 py-4">
                      <div className="font-medium">{job.title}</div>
                      {job.kind === "discover" && (
                        <div className="mt-1 text-xs text-muted-foreground">
                          <Link
                            href="/agencies?sort=added.desc"
                            className="font-medium text-success hover:underline"
                          >
                            {Number(s?.accepted ?? 0).toLocaleString()} new
                            agencies
                          </Link>
                          {" · "}
                          {Number(s?.rejected ?? 0).toLocaleString()} not
                          relevant / unreachable
                          {Number(s?.pending ?? 0) > 0 &&
                            ` · ${Number(s?.pending).toLocaleString()} being checked`}
                        </div>
                      )}
                    </td>
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
                    <td className="px-5 py-4 whitespace-nowrap text-muted-foreground">
                      {new Date(job.created_at).toLocaleString("en-GB", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </td>
                    <td className="px-5 py-4 text-right">
                      {active && <CancelJobButton jobId={job.id} />}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableFrame>
      )}
    </>
  );
}
