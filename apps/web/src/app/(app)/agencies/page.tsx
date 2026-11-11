import { Download, ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import {
  FilterSelect,
  Pagination,
  SearchInput,
  SortHeader,
  TableFrame,
} from "@/components/app/data-table";
import { LiveRefresh } from "@/components/app/live-refresh";
import { EmptyState, PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { parseFilters, queryAgencies } from "@/lib/agencies";
import { requireWorkspace } from "@/lib/auth/workspace";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Agencies" };

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const WEBSITE_STATUS: Record<
  string,
  { label: string; tone: "success" | "warning" | "danger" }
> = {
  ok: { label: "Checked", tone: "success" },
  blocked: { label: "Blocked", tone: "warning" },
  unreachable: { label: "Offline", tone: "danger" },
  not_found: { label: "Not found", tone: "danger" },
  error: { label: "Error", tone: "danger" },
};

export default async function AgenciesPage({ searchParams }: Props) {
  const { workspaceId } = await requireWorkspace();
  const params = await searchParams;
  const filters = parseFilters(params);

  const supabase = await createClient();
  const [{ data: agencies, count, error }, countryResult] = await Promise.all([
    queryAgencies(workspaceId, filters, {
      limit: filters.size,
      offset: (filters.page - 1) * filters.size,
    }),
    supabase.rpc("agency_country_counts", { p_workspace_id: workspaceId }),
  ]);
  if (error) throw new Error(error.message);
  const countries = (countryResult.data ?? []) as {
    country_code: string | null;
    total: number;
  }[];

  const total = count ?? 0;
  const filtered = Boolean(
    filters.q || filters.country || filters.email || filters.status,
  );
  const exportQuery = new URLSearchParams(
    Object.entries(params).flatMap(([k, v]) =>
      k !== "page" && typeof v === "string" && v ? [[k, v]] : [],
    ),
  ).toString();

  return (
    <>
      <PageHeader
        title="Agencies"
        description={`${total.toLocaleString()} agencies${filtered ? " match your filters" : " in your database"}.`}
        actions={
          <div className="flex items-center gap-3">
            <LiveRefresh
              tables={["agencies", "agency_contacts"]}
              workspaceId={workspaceId}
              minIntervalMs={4000}
            />
            <Button asChild variant="outline">
              <a
                href={`/agencies/export${exportQuery ? `?${exportQuery}` : ""}`}
              >
                <Download /> Export CSV
              </a>
            </Button>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchInput
          placeholder="Search name, website or services…"
          className="max-w-md"
        />
        <FilterSelect
          param="country"
          label="Country"
          options={[
            { value: "", label: "All countries" },
            ...countries.map((c) => ({
              value: c.country_code ?? "none",
              label: `${c.country_code ?? "Unknown"} (${c.total.toLocaleString()})`,
            })),
          ]}
        />
        <FilterSelect
          param="email"
          label="Email"
          options={[
            { value: "", label: "Any email status" },
            { value: "with", label: "With email" },
            { value: "without", label: "Without email" },
          ]}
        />
        <FilterSelect
          param="status"
          label="Website status"
          options={[
            { value: "", label: "Any website status" },
            { value: "ok", label: "Checked" },
            { value: "unchecked", label: "Not checked yet" },
            { value: "blocked", label: "Blocked" },
            { value: "dead", label: "Offline / not found" },
          ]}
        />
        <Pagination
          page={filters.page}
          pageSize={filters.size}
          total={total}
          className="ml-auto"
        />
      </div>

      {!agencies?.length ? (
        <EmptyState
          title="No agencies found"
          text={
            filtered
              ? "Try a different search or filter."
              : "Import data or run a scraping job."
          }
        />
      ) : (
        <TableFrame>
          <table className="w-full text-left text-sm">
            <thead className="bg-muted text-muted-foreground">
              <tr>
                <th className="px-4 py-3">
                  <SortHeader field="name" current={filters.sort}>
                    Agency
                  </SortHeader>
                </th>
                <th className="px-4 py-3">
                  <SortHeader field="country" current={filters.sort}>
                    Country
                  </SortHeader>
                </th>
                <th className="px-4 py-3 font-medium">Services</th>
                <th className="px-4 py-3 font-medium">Emails</th>
                <th className="px-4 py-3">
                  <SortHeader field="checked" current={filters.sort}>
                    Website
                  </SortHeader>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {agencies.map((a, i) => {
                const emails = a.agency_contacts.filter((c) => c.email);
                const status = a.website_status
                  ? WEBSITE_STATUS[a.website_status]
                  : undefined;
                return (
                  <tr
                    key={a.id}
                    className="animate-in align-top transition-colors fade-in hover:bg-muted/50"
                    style={{
                      animationDelay: `${Math.min(i, 20) * 15}ms`,
                      animationFillMode: "both",
                    }}
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/agencies/${a.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {a.name}
                      </Link>
                      <div className="text-xs text-muted-foreground">
                        {a.identity_key}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {a.country_code ?? a.country_name ?? "—"}
                    </td>
                    <td className="max-w-sm px-4 py-3 text-muted-foreground">
                      <span className="line-clamp-2">
                        {a.description ?? "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {emails[0]?.email ?? "—"}
                      {emails.length > 1 && (
                        <span className="ml-1 rounded-full bg-accent px-1.5 text-xs text-accent-foreground">
                          +{emails.length - 1}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {a.website_url ? (
                        <a
                          href={a.website_url}
                          target="_blank"
                          rel="noopener noreferrer nofollow"
                          className="inline-flex items-center gap-1 text-muted-foreground transition-colors hover:text-primary"
                        >
                          Visit <ExternalLink className="size-3.5" />
                        </a>
                      ) : (
                        "—"
                      )}
                      {status && (
                        <div className="mt-1">
                          <StatusBadge tone={status.tone}>
                            {status.label}
                          </StatusBadge>
                        </div>
                      )}
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
