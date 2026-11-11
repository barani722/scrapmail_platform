"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  userId: z.uuid(),
  status: z.enum(["approved", "rejected", "suspended"]),
  workspaceId: z.uuid().optional(),
});

/**
 * Approve, reject, suspend or reactivate an account.
 * Authorization is enforced twice: here (requireAdmin) and in the database
 * function admin_review_account (checks the caller is a platform admin).
 */
export async function reviewAccount(formData: FormData) {
  await requireAdmin();

  const parsed = schema.safeParse({
    userId: formData.get("userId"),
    status: formData.get("status"),
    workspaceId: formData.get("workspaceId") || undefined,
  });
  if (!parsed.success) throw new Error("Invalid request");
  const { userId, status, workspaceId } = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_review_account", {
    p_user_id: userId,
    p_status: status,
    p_workspace_id: status === "approved" ? (workspaceId ?? null) : null,
    p_role: "member",
  });
  if (error) throw new Error(error.message);

  // Block (or restore) sign-in in Supabase Auth, ending active sessions.
  const admin = createAdminClient();
  const { error: banError } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: status === "approved" ? "none" : "876000h",
  });
  if (banError) throw new Error(banError.message);

  revalidatePath("/admin/users");
  revalidatePath("/dashboard");
}
