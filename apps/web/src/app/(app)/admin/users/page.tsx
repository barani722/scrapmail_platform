import type { Metadata } from "next";

import { EmptyState, PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { requireAdmin, type AccountStatus } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

import { reviewAccount } from "./actions";

export const metadata: Metadata = { title: "User approvals" };

type Row = {
  user_id: string;
  email: string;
  full_name: string;
  status: AccountStatus;
  platform_role: "user" | "admin";
  created_at: string;
};

const STATUS_STYLE: Record<AccountStatus, string> = {
  pending: "bg-amber-50 text-amber-800",
  approved: "bg-green-50 text-green-800",
  rejected: "bg-slate-100 text-slate-700",
  suspended: "bg-red-50 text-red-700",
};

export default async function AdminUsersPage() {
  const me = await requireAdmin();
  const supabase = await createClient();

  const [{ data: users }, { data: workspace }] = await Promise.all([
    supabase
      .from("profiles")
      .select("user_id, email, full_name, status, platform_role, created_at")
      .order("status", { ascending: true })
      .order("created_at", { ascending: false })
      .returns<Row[]>(),
    supabase
      .from("workspaces")
      .select("id")
      .order("created_at")
      .limit(1)
      .maybeSingle<{ id: string }>(),
  ]);

  return (
    <>
      <PageHeader
        title="User approvals"
        description="Review registration requests and manage account access."
      />

      {!users?.length ? (
        <EmptyState title="No users" text="No accounts have registered yet." />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted text-muted-foreground">
              <tr>
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-5 py-3 font-medium">Email</th>
                <th className="px-5 py-3 font-medium">Registered</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {users.map((user) => (
                <tr key={user.user_id}>
                  <td className="px-5 py-4 font-medium">
                    {user.full_name || "—"}
                    {user.platform_role === "admin" && (
                      <span className="ml-2 rounded-full bg-accent px-2 py-0.5 text-xs text-accent-foreground">
                        Admin
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-4">{user.email}</td>
                  <td className="px-5 py-4 text-muted-foreground">
                    {new Date(user.created_at).toLocaleDateString("en-GB")}
                  </td>
                  <td className="px-5 py-4">
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-1 text-xs font-medium capitalize",
                        STATUS_STYLE[user.status],
                      )}
                    >
                      {user.status}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    {user.user_id === me.user_id ? (
                      <p className="text-right text-muted-foreground">You</p>
                    ) : (
                      <Actions
                        userId={user.user_id}
                        status={user.status}
                        workspaceId={workspace?.id}
                      />
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

function Actions({
  userId,
  status,
  workspaceId,
}: {
  userId: string;
  status: AccountStatus;
  workspaceId?: string;
}) {
  const button = (
    next: "approved" | "rejected" | "suspended",
    label: string,
  ) => (
    <form action={reviewAccount}>
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="status" value={next} />
      {workspaceId && (
        <input type="hidden" name="workspaceId" value={workspaceId} />
      )}
      <Button
        type="submit"
        size="sm"
        variant={next === "approved" ? "default" : "outline"}
      >
        {label}
      </Button>
    </form>
  );

  return (
    <div className="flex justify-end gap-2">
      {status === "pending" && (
        <>
          {button("approved", "Approve")}
          {button("rejected", "Reject")}
        </>
      )}
      {status === "approved" && button("suspended", "Suspend")}
      {(status === "suspended" || status === "rejected") &&
        button("approved", "Reactivate")}
    </div>
  );
}
