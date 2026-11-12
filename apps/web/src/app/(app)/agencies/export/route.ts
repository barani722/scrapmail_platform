import type { NextRequest } from "next/server";

import { parseFilters, queryAgencies } from "@/lib/agencies";
import { requireWorkspace } from "@/lib/auth/workspace";
import { countryName } from "@/lib/countries";

const MAX_ROWS = 20_000;
const BATCH = 1000;

function csvCell(value: string | null | undefined) {
  const text = (value ?? "").replace(/\r?\n/g, " ");
  return /[",;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** CSV export of the agency list with the current filters (members only, via RLS). */
export async function GET(request: NextRequest) {
  const { workspaceId } = await requireWorkspace();
  const filters = parseFilters(
    Object.fromEntries(request.nextUrl.searchParams),
  );

  const lines = [
    [
      "Agency",
      "Website",
      "Domain",
      "Country",
      "City",
      "Emails",
      "Phone",
      "Relevance",
      "Keywords",
      "Services",
      "Website status",
    ].join(","),
  ];
  for (let offset = 0; offset < MAX_ROWS; offset += BATCH) {
    const { data, error } = await queryAgencies(workspaceId, filters, {
      limit: BATCH,
      offset,
    });
    if (error) return new Response(error.message, { status: 500 });
    for (const a of data ?? []) {
      lines.push(
        [
          a.name,
          a.website_url,
          a.identity_key,
          countryName(a.country_code) ?? a.country_name,
          a.city,
          a.agency_contacts
            .map((c) => c.email)
            .filter(Boolean)
            .join("; "),
          a.phone,
          a.relevance,
          (a.relevance_keywords ?? []).join("; "),
          a.description,
          a.website_status,
        ]
          .map(csvCell)
          .join(","),
      );
    }
    if (!data || data.length < BATCH) break;
  }

  const date = new Date().toISOString().slice(0, 10);
  return new Response(`﻿${lines.join("\r\n")}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="agencies-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
