"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireWorkspace } from "@/lib/auth/workspace";
import { createClient } from "@/lib/supabase/server";

export type ActionResult =
  { ok: true; message: string } | { ok: false; error: string };

const filterSchema = z.enum(["missing_email", "never_checked", "all"]);

/** Queue an "enrich agency websites" job. Membership is checked in the database. */
export async function createEnrichJob(filter: string): Promise<ActionResult> {
  const { workspaceId } = await requireWorkspace();
  const parsed = filterSchema.safeParse(filter);
  if (!parsed.success) return { ok: false, error: "Unknown job type" };

  const supabase = await createClient();
  const { data: jobId, error } = await supabase.rpc("create_enrich_job", {
    p_workspace_id: workspaceId,
    p_filter: parsed.data,
  });
  if (error) return { ok: false, error: error.message };

  const { data: job } = await supabase
    .from("scrape_jobs")
    .select("total_tasks")
    .eq("id", jobId as string)
    .maybeSingle<{ total_tasks: number }>();

  revalidatePath("/scraping-jobs");
  revalidatePath("/dashboard");
  const total = job?.total_tasks ?? 0;
  return {
    ok: true,
    message:
      total === 0
        ? "Nothing to do: no agencies match this job."
        : `Job started: ${total.toLocaleString()} websites queued.`,
  };
}

export async function cancelJob(jobId: string): Promise<ActionResult> {
  await requireWorkspace();
  const parsed = z.uuid().safeParse(jobId);
  if (!parsed.success) return { ok: false, error: "Invalid job" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_scrape_job", {
    p_job_id: parsed.data,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/scraping-jobs");
  return { ok: true, message: "Job cancelled." };
}
