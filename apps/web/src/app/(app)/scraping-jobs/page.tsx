import type { Metadata } from "next";

import { AutoRefresh } from "@/components/app/auto-refresh";
import {
  JobProgress,
  type JobStatus,
  JobStatusBadge,
} from "@/components/app/job-status";
import { EmptyState, PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { requireWorkspace } from "@/lib/auth/workspace";
import { createClient } from "@/lib/supabase/server";

import { cancelJob, createEnrichJob } from "./actions";

export const metadata: Metadata = { title: "Scraping Jobs" };

type Job = {
  id: string;
  title: string;
  kind: string;
  status: JobStatus;
  total_tasks: number;
  done_tasks: number;
  failed_tasks: number;
  created_at: string;
  finished_at: string | null;
};

export default async function ScrapingJobsPage() {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();
  const { data: jobs } = await supabase
    .from("scrape_jobs")
    .select(
      "id, title, kind, status, total_tasks, done_tasks, failed_tasks, created_at, finished_at",
    )
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(50)
    .returns<Job[]>();

  const active = (jobs ?? []).some(
    (j) => j.status === "queued" || j.status === "running",
  );

  return (
    <>
      <AutoRefresh active={active} />
      <PageHeader
        title="Scraping Jobs"
        description="Visit agency websites to collect emails, phone numbers and business details."
      />

      <section className="mb-8 rounded-xl border bg-card p-6">
        <h2 className="text-lg font-bold">New website enrichment job</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          The worker visits each agency website (homepage and contact/about
          pages), respects robots.txt, and only fills empty fields. Imported
          data is never overwritten.
        </p>
        <form
          action={createEnrichJob}
          className="mt-4 flex flex-wrap items-center gap-3"
        >
          <select
            name="filter"
            defaultValue="missing_email"
            className="h-10 rounded-lg border border-input bg-background px-3"
            aria-label="Which agencies"
          >
            <option value="missing_email">Agencies without an email</option>
            <option value="never_checked">Agencies never checked</option>
            <option value="all">All agencies with a website</option>
          </select>
          <Button type="submit">Start job</Button>
        </form>
      </section>

      {!jobs?.length ? (
        <EmptyState
          title="No scraping jobs yet"
          text="Start your first enrichment job above."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
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
              {jobs.map((job) => (
                <tr key={job.id}>
                  <td className="px-5 py-4 font-medium">{job.title}</td>
                  <td className="px-5 py-4">
                    <JobStatusBadge status={job.status} />
                  </td>
                  <td className="px-5 py-4">
                    <JobProgress
                      done={job.done_tasks}
                      failed={job.failed_tasks}
                      total={job.total_tasks}
                    />
                  </td>
                  <td className="px-5 py-4 text-muted-foreground">
                    {new Date(job.created_at).toLocaleString("en-GB", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </td>
                  <td className="px-5 py-4 text-right">
                    {(job.status === "queued" || job.status === "running") && (
                      <form action={cancelJob}>
                        <input type="hidden" name="jobId" value={job.id} />
                        <Button type="submit" variant="outline" size="sm">
                          Cancel
                        </Button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
