"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireWorkspace } from "@/lib/auth/workspace";
import { SEARCH_PHRASES } from "@/lib/discovery";
import { createClient } from "@/lib/supabase/server";

export type ActionResult =
  { ok: true; message: string } | { ok: false; error: string };

const filterSchema = z.enum(["missing_email", "never_checked", "all"]);

const discoverySchema = z.object({
  source: z.enum(["osm", "links", "search"]),
  countries: z.array(z.string().regex(/^[A-Z]{2}$/)).max(300),
  queries: z.array(z.enum(SEARCH_PHRASES)).max(SEARCH_PHRASES.length),
});

/** Queue a "find new agencies" job. Membership is checked in the database. */
export async function createDiscoveryJob(input: {
  source: string;
  countries: string[];
  queries: string[];
}): Promise<ActionResult> {
  const { workspaceId } = await requireWorkspace();
  const parsed = discoverySchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: "Invalid discovery settings" };
  const { source, countries, queries } = parsed.data;
  if (source !== "links" && countries.length === 0) {
    return { ok: false, error: "Choose at least one country." };
  }
  if (source === "search" && queries.length === 0) {
    return { ok: false, error: "Choose at least one search phrase." };
  }

  const supabase = await createClient();
  const { data: jobId, error } = await supabase.rpc("create_discovery_job", {
    p_workspace_id: workspaceId,
    p_source: source,
    p_countries: countries,
    p_queries: source === "search" ? queries : [],
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
  const unit =
    source === "osm"
      ? "countries"
      : source === "links"
        ? "agency websites"
        : "searches";
  return {
    ok: true,
    message: `Discovery started: ${total.toLocaleString()} ${unit} queued.`,
  };
}

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
