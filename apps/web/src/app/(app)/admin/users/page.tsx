import type { Metadata } from "next";

import { TableFrame } from "@/components/app/data-table";
import { LiveRefresh } from "@/components/app/live-refresh";
import { EmptyState, PageHeader } from "@/components/app/page-header";
import { StatusBadge, type Tone } from "@/components/app/status-badge";
import { requireAdmin, type AccountStatus } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import { ResetPasswordDialog, StatusSelect } from "./user-controls";

export const metadata: Metadata = { title: "User management" };

type Row = {
  user_id: string;
  email: string;
  full_name: string;
  status: AccountStatus;
  platform_role: "user" | "admin";
  created_at: string;
  password_changed_at: string | null;
};

const TONE: Record<AccountStatus, Tone> = {
  pending: "warning",
  approved: "success",
  rejected: "neutral",
  suspended: "danger",
};

const when = (value: string | null | undefined) =>
  value
    ? new Date(value).toLocaleString("en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "—";

export default async function AdminUsersPage() {
  const me = await requireAdmin();
  const supabase = await createClient();
  const [{ data: users }, authUsers] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "user_id, email, full_name, status, platform_role, created_at, password_changed_at",
      )
      .order("status", { ascending: true })
      .order("created_at", { ascending: false })
      .returns<Row[]>(),
    // Sign-in times live in Supabase Auth (server-side admin API, admins only).
    createAdminClient().auth.admin.listUsers({ perPage: 1000 }),
  ]);

  const lastSignIn = new Map(
    (authUsers.data?.users ?? []).map((u) => [u.id, u.last_sign_in_at ?? null]),
  );
  const pending = users?.filter((u) => u.status === "pending").length ?? 0;

  return (
    <>
      <PageHeader
        title="User management"
        description={
          pending
            ? `${pending} registration ${pending === 1 ? "request is" : "requests are"} waiting for review.`
            : "Review registrations, change account status and update passwords."
        }
        actions={<LiveRefresh tables={["profiles"]} minIntervalMs={1000} />}
      />

      {!users?.length ? (
        <EmptyState title="No users" text="No accounts have registered yet." />
      ) : (
        <TableFrame>
          <table className="w-full text-left text-sm">
            <thead className="bg-muted text-muted-foreground">
              <tr>
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-5 py-3 font-medium">Email</th>
                <th className="px-5 py-3 font-medium">Registered</th>
                <th className="px-5 py-3 font-medium">Last sign-in</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Change status</th>
                <th className="px-5 py-3 font-medium">Password</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {users.map((user) => {
                const isMe = user.user_id === me.user_id;
                return (
                  <tr
                    key={user.user_id}
                    className="animate-in transition-colors fade-in hover:bg-muted/50"
                  >
                    <td className="px-5 py-4 font-medium">
                      {user.full_name || "—"}
                      {user.platform_role === "admin" && (
                        <StatusBadge tone="info" className="ml-2">
                          Admin
                        </StatusBadge>
                      )}
                    </td>
                    <td className="px-5 py-4">{user.email}</td>
                    <td className="px-5 py-4 whitespace-nowrap text-muted-foreground">
                      {new Date(user.created_at).toLocaleDateString("en-GB")}
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap text-muted-foreground">
                      {when(lastSignIn.get(user.user_id))}
                    </td>
                    <td className="px-5 py-4">
                      <StatusBadge tone={TONE[user.status]}>
                        {user.status}
                      </StatusBadge>
                    </td>
                    <td className="px-5 py-4">
                      {isMe ? (
                        <span
                          className="text-muted-foreground"
                          title="You cannot change your own status"
                        >
                          You
                        </span>
                      ) : (
                        <StatusSelect
                          key={user.status}
                          userId={user.user_id}
                          status={user.status}
                        />
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <ResetPasswordDialog
                          userId={user.user_id}
                          email={user.email}
                        />
                        <span className="text-xs whitespace-nowrap text-muted-foreground">
                          {user.password_changed_at
                            ? `Changed ${when(user.password_changed_at)}`
                            : "Set by user"}
                        </span>
                      </div>
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
