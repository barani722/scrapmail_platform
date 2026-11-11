import { Download, ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState, PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PAGE_SIZE, parseFilters, queryAgencies } from "@/lib/agencies";
import { requireWorkspace } from "@/lib/auth/workspace";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Agencies" };

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AgenciesPage({ searchParams }: Props) {
  const { workspaceId } = await requireWorkspace();
  const filters = parseFilters(await searchParams);
  const page = filters.page ?? 1;

  const supabase = await createClient();
  const [{ data: agencies, count, error }, countryResult] = await Promise.all([
    queryAgencies(workspaceId, filters, {
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }),
    supabase.rpc("agency_country_counts", { p_workspace_id: workspaceId }),
  ]);
  if (error) throw new Error(error.message);
  const countries = (countryResult.data ?? []) as {
    country_code: string | null;
    total: number;
  }[];

  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const query = (overrides: Record<string, string | number>) => {
    const params = new URLSearchParams();
    const merged = {
      q: filters.q,
      country: filters.country,
      email: filters.email,
      page,
      ...overrides,
    };
    for (const [k, v] of Object.entries(merged)) {
      if (v && !(k === "page" && v === 1)) params.set(k, String(v));
    }
    const s = params.toString();
    return s ? `?${s}` : "";
  };

  return (
    <>
      <PageHeader
        title="Agencies"
        description={`${total.toLocaleString()} agencies${filters.q || filters.country || filters.email ? " match your filters" : " in your database"}.`}
        actions={
          <Button asChild variant="outline">
            <a href={`/agencies/export${query({ page: 1 })}`}>
              <Download /> Export CSV
            </a>
          </Button>
        }
      />

      <form className="mb-6 flex flex-wrap gap-3" action="/agencies">
        <Input
          name="q"
          defaultValue={filters.q}
          placeholder="Search name, website or services…"
          className="h-11 max-w-md flex-1"
        />
        <select
          name="country"
          defaultValue={filters.country}
          className="h-11 rounded-lg border border-input bg-background px-3"
          aria-label="Country"
        >
          <option value="">All countries</option>
          {(countries ?? []).map((c) => (
            <option
              key={c.country_code ?? "none"}
              value={c.country_code ?? "none"}
            >
              {c.country_code ?? "Unknown"} ({c.total})
            </option>
          ))}
        </select>
        <select
          name="email"
          defaultValue={filters.email}
          className="h-11 rounded-lg border border-input bg-background px-3"
          aria-label="Email"
        >
          <option value="">With or without email</option>
          <option value="with">With email only</option>
        </select>
        <Button type="submit" className="h-11">
          Filter
        </Button>
        {(filters.q || filters.country || filters.email) && (
          <Button asChild variant="ghost" className="h-11">
            <Link href="/agencies">Clear</Link>
          </Button>
        )}
      </form>

      {!agencies?.length ? (
        <EmptyState
          title="No agencies found"
          text="Try a different search or filter."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Agency</th>
                <th className="px-4 py-3 font-medium">Country</th>
                <th className="px-4 py-3 font-medium">Services</th>
                <th className="px-4 py-3 font-medium">Emails</th>
                <th className="px-4 py-3 font-medium">Website</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {agencies.map((a) => {
                const emails = a.agency_contacts.filter((c) => c.email);
                return (
                  <tr key={a.id} className="align-top hover:bg-muted/40">
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
                        <span className="ml-1 text-xs text-muted-foreground">
                          +{emails.length - 1}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {a.website_url ? (
                        <a
                          href={a.website_url}
                          target="_blank"
                          rel="noopener noreferrer nofollow"
                          className="inline-flex items-center gap-1 text-muted-foreground hover:text-primary"
                        >
                          Visit <ExternalLink className="size-3.5" />
                        </a>
                      ) : (
                        "—"
                      )}
                      {a.website_status && a.website_status !== "ok" && (
                        <div className="text-xs text-destructive">
                          {a.website_status}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <nav
          className="mt-6 flex items-center justify-between text-sm"
          aria-label="Pagination"
        >
          <span className="text-muted-foreground">
            Page {page} of {pages.toLocaleString()}
          </span>
          <div className="flex gap-2">
            <Button
              asChild
              variant="outline"
              size="sm"
              aria-disabled={page <= 1}
            >
              <Link href={`/agencies${query({ page: Math.max(1, page - 1) })}`}>
                Previous
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="sm"
              aria-disabled={page >= pages}
            >
              <Link
                href={`/agencies${query({ page: Math.min(pages, page + 1) })}`}
              >
                Next
              </Link>
            </Button>
          </div>
        </nav>
      )}
    </>
  );
}
