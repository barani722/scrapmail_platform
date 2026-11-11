"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type ActionResult =
  { ok: true; message: string } | { ok: false; error: string };

const statusSchema = z.object({
  userId: z.uuid(),
  status: z.enum(["pending", "approved", "rejected", "suspended"]),
});

/**
 * Change an account's status at any time.
 * Authorization is enforced twice: here (requireAdmin) and in the database
 * function admin_review_account (checks the caller is a platform admin).
 */
export async function setAccountStatus(
  userId: string,
  status: string,
): Promise<ActionResult> {
  await requireAdmin();
  const parsed = statusSchema.safeParse({ userId, status });
  if (!parsed.success) return { ok: false, error: "Invalid request" };

  const supabase = await createClient();
  const { data: workspace } = await supabase
    .from("workspaces")
    .select("id")
    .order("created_at")
    .limit(1)
    .maybeSingle<{ id: string }>();

  const { error } = await supabase.rpc("admin_review_account", {
    p_user_id: parsed.data.userId,
    p_status: parsed.data.status,
    p_workspace_id:
      parsed.data.status === "approved" ? (workspace?.id ?? null) : null,
    p_role: "member",
  });
  if (error) return { ok: false, error: error.message };

  // Only approved accounts may sign in; others are blocked in Supabase Auth,
  // which also ends their active sessions.
  const admin = createAdminClient();
  const { error: banError } = await admin.auth.admin.updateUserById(
    parsed.data.userId,
    {
      ban_duration: parsed.data.status === "approved" ? "none" : "876000h",
    },
  );
  if (banError) return { ok: false, error: banError.message };

  revalidatePath("/admin/users");
  return { ok: true, message: `Status changed to ${parsed.data.status}.` };
}

const passwordSchema = z.object({
  userId: z.uuid(),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(72, "Password must be at most 72 characters"),
});

/** Set a new password for a user (e.g. when they forgot it). */
export async function resetUserPassword(
  userId: string,
  password: string,
): Promise<ActionResult> {
  await requireAdmin();
  const parsed = passwordSchema.safeParse({ userId, password });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid request",
    };
  }

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(parsed.data.userId, {
    password: parsed.data.password,
  });
  if (error) return { ok: false, error: error.message };

  // Record when (not what): the password itself is never stored readable.
  await admin
    .from("profiles")
    .update({ password_changed_at: new Date().toISOString() })
    .eq("user_id", parsed.data.userId);
  revalidatePath("/admin/users");
  return {
    ok: true,
    message: "Password updated. Share it with the user securely.",
  };
}
