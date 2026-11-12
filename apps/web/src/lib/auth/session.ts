import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

export type AccountStatus = "pending" | "approved" | "rejected" | "suspended";

export type Profile = {
  user_id: string;
  email: string;
  full_name: string;
  status: AccountStatus;
  platform_role: "user" | "admin";
};

/**
 * Signed-in user's id from the session token (verified locally with the
 * project's signing key, no network call), or null. Cached per request.
 */
export const getUserId = cache(async (): Promise<string | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return data?.claims?.sub ?? null;
});

/** Signed-in user's profile, or null. Cached for the duration of a request. */
export const getCurrentProfile = cache(async (): Promise<Profile | null> => {
  const userId = await getUserId();
  if (!userId) return null;

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("user_id, email, full_name, status, platform_role")
    .eq("user_id", userId)
    .maybeSingle<Profile>();

  return profile ?? null;
});

/** Require a signed-in, approved account; otherwise redirect. */
export async function requireApprovedProfile(): Promise<Profile> {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.status !== "approved") redirect("/pending");
  return profile;
}

/** Require an approved platform administrator; otherwise redirect. */
export async function requireAdmin(): Promise<Profile> {
  const profile = await requireApprovedProfile();
  if (profile.platform_role !== "admin") redirect("/dashboard");
  return profile;
}
