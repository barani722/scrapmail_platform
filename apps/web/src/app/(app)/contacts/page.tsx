import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState, PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requireWorkspace } from "@/lib/auth/workspace";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Contacts" };

const PAGE_SIZE = 50;

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
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);

  const supabase = await createClient();
  let query = supabase
    .from("agency_contacts")
    .select(
      "id, email, full_name, job_title, is_role_address, source, agencies(id, name, country_code)",
      {
        count: "exact",
      },
    )
    .eq("workspace_id", workspaceId);
  const term = q.replace(/[%,()*]/g, " ").trim();
  if (term) query = query.or(`email.ilike.%${term}%,full_name.ilike.%${term}%`);
  const { data: contacts, count } = await query
    .order("email")
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)
    .returns<Contact[]>();

  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const href = (p: number) =>
    `/contacts?${new URLSearchParams({ ...(q ? { q } : {}), page: String(p) })}`;

  return (
    <>
      <PageHeader
        title="Contacts"
        description={`${total.toLocaleString()} email contacts.`}
      />
      <form className="mb-6 flex gap-3" action="/contacts">
        <Input
          name="q"
          defaultValue={q}
          placeholder="Search email or name…"
          className="h-11 max-w-md"
        />
        <Button type="submit" className="h-11">
          Search
        </Button>
      </form>

      {!contacts?.length ? (
        <EmptyState title="No contacts found" text="Try a different search." />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
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
              {contacts.map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-3">
                    {c.email}
                    {c.is_role_address && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        (general)
                      </span>
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
                  <td className="px-4 py-3 capitalize">{c.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <nav className="mt-6 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Page {page} of {pages}
          </span>
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href={href(Math.max(1, page - 1))}>Previous</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href={href(Math.min(pages, page + 1))}>Next</Link>
            </Button>
          </div>
        </nav>
      )}
    </>
  );
}
