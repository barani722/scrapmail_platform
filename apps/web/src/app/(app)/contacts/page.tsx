import type { Metadata } from "next";
import Link from "next/link";

import {
  FilterSelect,
  Pagination,
  SearchInput,
  TableFrame,
} from "@/components/app/data-table";
import { LiveRefresh } from "@/components/app/live-refresh";
import { EmptyState, PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { requireWorkspace } from "@/lib/auth/workspace";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Contacts" };

type Contact = {
  id: string;
  email: string | null;
  full_name: string | null;
  job_title: string | null;
  is_role_address: boolean;
  source: string;
  agencies: { id: string; name: string; country_code: string | null } | null;
};

type Props = { searchParams: Promise<Record<string, string | undefined>> };

export default async function ContactsPage({ searchParams }: Props) {
  const { workspaceId } = await requireWorkspace();
  const params = await searchParams;
  const q = (params.q ?? "").trim().slice(0, 100);
  const source = ["import", "website"].includes(params.source ?? "")
    ? params.source
    : "";
  const kind = ["person", "general"].includes(params.kind ?? "")
    ? params.kind
    : "";
  const size = [25, 50, 100].includes(Number(params.size))
    ? Number(params.size)
    : 50;
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);

  const supabase = await createClient();
  let query = supabase
    .from("agency_contacts")
    .select(
      "id, email, full_name, job_title, is_role_address, source, agencies(id, name, country_code)",
      { count: "exact" },
    )
    .eq("workspace_id", workspaceId);
  const term = q.replace(/[%,()*]/g, " ").trim();
  if (term) query = query.or(`email.ilike.%${term}%,full_name.ilike.%${term}%`);
  if (source) query = query.eq("source", source);
  if (kind === "person") query = query.eq("is_role_address", false);
  if (kind === "general") query = query.eq("is_role_address", true);

  const { data: contacts, count } = await query
    .order("email")
    .range((page - 1) * size, page * size - 1)
    .returns<Contact[]>();
  const total = count ?? 0;

  return (
    <>
      <PageHeader
        title="Contacts"
        description={`${total.toLocaleString()} email contacts${term || source || kind ? " match your filters" : ""}.`}
        actions={
          <LiveRefresh
            tables={["agency_contacts"]}
            workspaceId={workspaceId}
            minIntervalMs={4000}
          />
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchInput placeholder="Search email or name…" className="max-w-md" />
        <FilterSelect
          param="source"
          label="Source"
          options={[
            { value: "", label: "All sources" },
            { value: "import", label: "Client import" },
            { value: "website", label: "Agency website" },
          ]}
        />
        <FilterSelect
          param="kind"
          label="Type"
          options={[
            { value: "", label: "All types" },
            { value: "person", label: "Personal addresses" },
            { value: "general", label: "General addresses (info@…)" },
          ]}
        />
        <Pagination
          page={page}
          pageSize={size}
          total={total}
          className="ml-auto"
        />
      </div>

      {!contacts?.length ? (
        <EmptyState
          title="No contacts found"
          text="Try a different search or filter."
        />
      ) : (
        <TableFrame>
          <table className="w-full text-left text-sm">
            <thead className="bg-muted text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Title</th>
                <th className="px-4 py-3 font-medium">Agency</th>
                <th className="px-4 py-3 font-medium">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {contacts.map((c, i) => (
                <tr
                  key={c.id}
                  className="animate-in transition-colors fade-in hover:bg-muted/50"
                  style={{
                    animationDelay: `${Math.min(i, 20) * 15}ms`,
                    animationFillMode: "both",
                  }}
                >
                  <td className="px-4 py-3">
                    {c.email}
                    {c.is_role_address && (
                      <StatusBadge tone="neutral" className="ml-2">
                        general
                      </StatusBadge>
                    )}
                  </td>
                  <td className="px-4 py-3">{c.full_name ?? "—"}</td>
                  <td className="px-4 py-3">{c.job_title ?? "—"}</td>
                  <td className="px-4 py-3">
                    {c.agencies ? (
                      <Link
                        href={`/agencies/${c.agencies.id}`}
                        className="text-primary hover:underline"
                      >
                        {c.agencies.name}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge
                      tone={c.source === "website" ? "info" : "neutral"}
                    >
                      {c.source === "website" ? "website" : "import"}
                    </StatusBadge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableFrame>
      )}
    </>
  );
}
