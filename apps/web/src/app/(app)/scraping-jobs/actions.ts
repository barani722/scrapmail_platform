"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireWorkspace } from "@/lib/auth/workspace";
import { createClient } from "@/lib/supabase/server";

const createSchema = z.object({
  filter: z.enum(["missing_email", "never_checked", "all"]),
});

/** Queue an "enrich agency websites" job. Membership is checked in the database. */
export async function createEnrichJob(formData: FormData) {
  const { workspaceId } = await requireWorkspace();
  const { filter } = createSchema.parse({ filter: formData.get("filter") });

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_enrich_job", {
    p_workspace_id: workspaceId,
    p_filter: filter,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/scraping-jobs");
  revalidatePath("/dashboard");
}

export async function cancelJob(formData: FormData) {
  await requireWorkspace();
  const jobId = z.uuid().parse(formData.get("jobId"));
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_scrape_job", {
    p_job_id: jobId,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/scraping-jobs");
}
