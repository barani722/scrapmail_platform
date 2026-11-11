import type { Metadata } from "next";

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

import { CancelJobButton, NewJobForm } from "./job-controls";

export const metadata: Metadata = { title: "Scraping Jobs" };

type Job = {
  id: string;
  title: string;
  status: JobStatus;
  total_tasks: number;
  done_tasks: number;
  failed_tasks: number;
  created_at: string;
};

export default async function ScrapingJobsPage() {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();
  const { data: jobs } = await supabase
    .from("scrape_jobs")
    .select(
      "id, title, status, total_tasks, done_tasks, failed_tasks, created_at",
    )
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(50)
    .returns<Job[]>();

  return (
    <>
      <PageHeader
        title="Scraping Jobs"
        description="Visit agency websites to collect emails, phone numbers and business details."
        actions={
          <LiveRefresh
            tables={["scrape_jobs"]}
            workspaceId={workspaceId}
            minIntervalMs={1500}
          />
        }
      />

      <section className="mb-8 rounded-xl border bg-card p-6 shadow-sm">
        <h2 className="text-lg font-bold">New website enrichment job</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          The worker visits each agency website (homepage and contact/about
          pages), respects robots.txt, and only fills empty fields. Imported
          data is never overwritten.
        </p>
        <NewJobForm />
      </section>

      {!jobs?.length ? (
        <EmptyState
          title="No scraping jobs yet"
          text="Start your first enrichment job above."
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
                return (
                  <tr
                    key={job.id}
                    className="animate-in transition-colors fade-in hover:bg-muted/50"
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
