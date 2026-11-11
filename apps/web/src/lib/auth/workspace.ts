import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

import { requireApprovedProfile } from "./session";

/** The signed-in user's workspace (first membership). */
export const requireWorkspace = cache(async () => {
  const profile = await requireApprovedProfile();
  const supabase = await createClient();
  const { data } = await supabase
    .from("workspace_members")
    .select("workspace_id, role, workspaces(name)")
    .eq("user_id", profile.user_id)
    .order("created_at")
    .limit(1)
    .maybeSingle<{
      workspace_id: string;
      role: string;
      workspaces: { name: string } | null;
    }>();

  if (!data) redirect("/pending");
  return {
    profile,
    workspaceId: data.workspace_id,
    workspaceName: data.workspaces?.name ?? "Workspace",
    role: data.role,
  };
});
