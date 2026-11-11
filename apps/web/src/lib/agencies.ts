import "server-only";

import { createClient } from "@/lib/supabase/server";

export const PAGE_SIZES = [25, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 50;

export const AGENCY_SORT_FIELDS = {
  name: "name",
  country: "country_code",
  checked: "last_checked_at",
  added: "created_at",
} as const;
export type AgencySortField = keyof typeof AGENCY_SORT_FIELDS;

export type AgencyFilters = {
  q: string;
  country: string;
  email: "with" | "without" | "";
  status: "" | "ok" | "blocked" | "dead" | "unchecked";
  page: number;
  size: number;
  sort: { field: AgencySortField; dir: "asc" | "desc" };
};

export type AgencyRow = {
  id: string;
  name: string;
  identity_key: string;
  website_url: string | null;
  country_code: string | null;
  country_name: string | null;
  description: string | null;
  phone: string | null;
  website_status: string | null;
  last_checked_at: string | null;
  agency_contacts: { email: string | null }[];
};

type Params = Record<string, string | string[] | undefined>;

export function parseFilters(params: Params): AgencyFilters {
  const value = (key: string) => {
    const v = params[key];
    return (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
  };
  const size = Number.parseInt(value("size"), 10);
  const [sortField, sortDir] = value("sort").split(".");
  const email = value("email");
  const status = value("status");
  return {
    q: value("q").slice(0, 100),
    country: /^[A-Z]{2}$|^none$/.test(value("country")) ? value("country") : "",
    email: email === "with" || email === "without" ? email : "",
    status: ["ok", "blocked", "dead", "unchecked"].includes(status)
      ? (status as AgencyFilters["status"])
      : "",
    page: Math.max(1, Number.parseInt(value("page") || "1", 10) || 1),
    size: (PAGE_SIZES as readonly number[]).includes(size)
      ? size
      : DEFAULT_PAGE_SIZE,
    sort: {
      field:
        sortField && sortField in AGENCY_SORT_FIELDS
          ? (sortField as AgencySortField)
          : "name",
      dir: sortDir === "desc" ? "desc" : "asc",
    },
  };
}

/** Agency query with filters applied (RLS limits results to the workspace). */
export async function queryAgencies(
  workspaceId: string,
  filters: AgencyFilters,
  { limit, offset }: { limit: number; offset: number },
) {
  const supabase = await createClient();
  const contacts =
    filters.email === "with"
      ? "agency_contacts!inner(email)"
      : "agency_contacts(email)";
  let query = supabase
    .from("agencies")
    .select(
      `id, name, identity_key, website_url, country_code, country_name, description, phone, website_status, last_checked_at, ${contacts}`,
      { count: "exact" },
    )
    .eq("workspace_id", workspaceId);

  const term = filters.q
    .replace(/[%,()*]/g, " ")
    .trim()
    .toLowerCase();
  if (term) {
    query = query.or(
      `normalized_name.ilike.%${term}%,identity_key.ilike.%${term}%,description.ilike.%${term}%`,
    );
  }
  if (filters.country === "none") query = query.is("country_code", null);
  else if (filters.country) query = query.eq("country_code", filters.country);

  if (filters.email === "without") query = query.is("agency_contacts", null);

  if (filters.status === "ok") query = query.eq("website_status", "ok");
  else if (filters.status === "blocked")
    query = query.eq("website_status", "blocked");
  else if (filters.status === "dead")
    query = query.in("website_status", ["unreachable", "not_found", "error"]);
  else if (filters.status === "unchecked")
    query = query.is("last_checked_at", null);

  const column = AGENCY_SORT_FIELDS[filters.sort.field];
  return query
    .order(column, { ascending: filters.sort.dir === "asc", nullsFirst: false })
    .order("id", { ascending: true })
    .range(offset, offset + limit - 1)
    .returns<AgencyRow[]>();
}
