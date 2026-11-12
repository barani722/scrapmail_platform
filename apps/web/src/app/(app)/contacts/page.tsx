import type { Metadata } from "next";
import Link from "next/link";

import { CountriesFilter } from "@/components/app/agency-filters";
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
import { countryName } from "@/lib/countries";
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
  const countries = [
    ...new Set(
      (params.country ?? "").split(",").filter((c) => /^[A-Z]{2}$/.test(c)),
    ),
  ].slice(0, 250);
  const relevance = ["abc", "A", "B", "C"].includes(params.relevance ?? "")
    ? params.relevance!
    : "";
  // Filters on the agency need an inner join (contacts of matching agencies only).
  const byAgency = countries.length > 0 || relevance !== "";

  const supabase = await createClient();
  const countsPromise = supabase.rpc("agency_country_counts", {
    p_workspace_id: workspaceId,
  });
  let query = supabase
    .from("agency_contacts")
    .select(
      `id, email, full_name, job_title, is_role_address, source, agencies${byAgency ? "!inner" : ""}(id, name, country_code)`,
      { count: "exact" },
    )
    .eq("workspace_id", workspaceId);
  if (countries.length) query = query.in("agencies.country_code", countries);
  if (relevance === "abc")
    query = query.in("agencies.relevance", ["A", "B", "C"]);
  else if (relevance) query = query.eq("agencies.relevance", relevance);
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
  const countryCounts = ((await countsPromise).data ?? []) as {
    country_code: string | null;
    total: number;
  }[];
  const filtered = Boolean(term || source || kind || byAgency);

  return (
    <>
      <PageHeader
        title="Contacts"
        description={`${total.toLocaleString()} email contacts${filtered ? " match your filters" : ""}.`}
        actions={
          <LiveRefresh
            tables={["scrape_jobs"]}
            workspaceId={workspaceId}
            minIntervalMs={10000}
          />
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchInput placeholder="Search email or name…" className="max-w-md" />
        <CountriesFilter
          counts={Object.fromEntries(
            countryCounts
              .filter((c) => c.country_code)
              .map((c) => [c.country_code as string, Number(c.total)]),
          )}
          unknown={0}
        />
        <FilterSelect
          param="relevance"
          label="Agency relevance"
          options={[
            { value: "", label: "Any agency" },
            { value: "abc", label: "Relevant agencies (A–C)" },
            { value: "A", label: "A · Tickets & hospitality" },
            { value: "B", label: "B · Sports & event travel" },
            { value: "C", label: "C · Travel & concierge" },
          ]}
        />
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
                <th className="px-4 py-3 font-medium">Country</th>
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
                    {countryName(c.agencies?.country_code) ?? "—"}
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
