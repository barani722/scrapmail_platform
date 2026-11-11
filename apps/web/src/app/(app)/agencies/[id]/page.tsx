import { ArrowLeft, ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { LiveRefresh } from "@/components/app/live-refresh";
import { countryName } from "@/lib/countries";
import { requireWorkspace } from "@/lib/auth/workspace";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Agency" };

type Agency = {
  id: string;
  name: string;
  identity_key: string;
  website_url: string | null;
  website_title: string | null;
  website_status: string | null;
  country_code: string | null;
  country_name: string | null;
  city: string | null;
  address: string | null;
  phone: string | null;
  description: string | null;
  last_checked_at: string | null;
  created_at: string;
  agency_contacts: {
    id: string;
    email: string | null;
    full_name: string | null;
    job_title: string | null;
    is_role_address: boolean;
    source: string;
  }[];
  agency_sources: {
    id: number;
    source_type: string;
    source_name: string;
    source_ref: string;
    observed_at: string;
  }[];
};

const date = (value: string | null) =>
  value
    ? new Date(value).toLocaleString("en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "—";

export default async function AgencyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { workspaceId } = await requireWorkspace();

  const supabase = await createClient();
  const { data: agency } = await supabase
    .from("agencies")
    .select(
      "id, name, identity_key, website_url, website_title, website_status, country_code, country_name, city, address, phone, description, last_checked_at, created_at, agency_contacts(id, email, full_name, job_title, is_role_address, source), agency_sources(id, source_type, source_name, source_ref, observed_at)",
    )
    .eq("id", id)
    .maybeSingle<Agency>();
  if (!agency) notFound();

  const facts: [string, string | null][] = [
    ["Domain", agency.identity_key],
    ["Country", countryName(agency.country_code) ?? agency.country_name],
    ["City", agency.city],
    ["Address", agency.address],
    ["Phone", agency.phone],
    ["Website title", agency.website_title],
    ["Website status", agency.website_status],
    ["Last checked", date(agency.last_checked_at)],
    ["Added", date(agency.created_at)],
  ];

  return (
    <>
      <Link
        href="/agencies"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"
      >
        <ArrowLeft className="size-4" /> Agencies
      </Link>
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{agency.name}</h1>
          {agency.description && (
            <p className="mt-2 max-w-3xl text-lg text-muted-foreground">
              {agency.description}
            </p>
          )}
        </div>
        <div className="flex items-center gap-4">
          <LiveRefresh
            tables={["agencies", "agency_contacts"]}
            workspaceId={workspaceId}
            minIntervalMs={3000}
          />
          {agency.website_url && (
            <a
              href={agency.website_url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              Open website <ExternalLink className="size-4" />
            </a>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="rounded-xl border bg-card p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-bold">Details</h2>
          <dl className="space-y-3 text-sm">
            {facts.map(([label, value]) => (
              <div key={label}>
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="font-medium break-words">{value || "—"}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="rounded-xl border bg-card p-6 shadow-sm lg:col-span-2">
          <h2 className="mb-4 text-lg font-bold">
            Contacts ({agency.agency_contacts.length})
          </h2>
          {agency.agency_contacts.length === 0 ? (
            <p className="text-muted-foreground">No contacts yet.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="py-2 font-medium">Email</th>
                  <th className="py-2 font-medium">Name</th>
                  <th className="py-2 font-medium">Title</th>
                  <th className="py-2 font-medium">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {agency.agency_contacts.map((c) => (
                  <tr key={c.id}>
                    <td className="py-2">
                      {c.email}
                      {c.is_role_address && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          (general)
                        </span>
                      )}
                    </td>
                    <td className="py-2">{c.full_name ?? "—"}</td>
                    <td className="py-2">{c.job_title ?? "—"}</td>
                    <td className="py-2 capitalize">{c.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <h2 className="mt-8 mb-4 text-lg font-bold">
            Sources ({agency.agency_sources.length})
          </h2>
          <ul className="space-y-2 text-sm">
            {agency.agency_sources.map((s) => (
              <li key={s.id} className="rounded-lg bg-muted px-3 py-2">
                <span className="font-medium capitalize">{s.source_type}</span>{" "}
                · {s.source_name}
                <div className="text-xs break-all text-muted-foreground">
                  {s.source_ref} · {date(s.observed_at)}
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
