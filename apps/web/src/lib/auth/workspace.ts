import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

import { getUserId, requireApprovedProfile } from "./session";

type Membership = {
  workspace_id: string;
  role: string;
  workspaces: { name: string } | null;
};

/** First workspace membership of the user (RLS returns it only when approved). */
const getMembership = cache(async (userId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("workspace_members")
    .select("workspace_id, role, workspaces(name)")
    .eq("user_id", userId)
    .order("created_at")
    .limit(1)
    .maybeSingle<Membership>();
  return data;
});

/** The signed-in user's workspace (first membership). */
export const requireWorkspace = cache(async () => {
  const userId = await getUserId();
  if (!userId) redirect("/login");
  // Profile and membership are loaded at the same time (one round trip, not two).
  const [profile, data] = await Promise.all([
    requireApprovedProfile(),
    getMembership(userId),
  ]);

  if (!data) redirect("/pending");
  return {
    profile,
    workspaceId: data.workspace_id,
    workspaceName: data.workspaces?.name ?? "Workspace",
    role: data.role,
  };
});
