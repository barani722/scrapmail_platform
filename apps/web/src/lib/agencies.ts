import "server-only";

import { createClient } from "@/lib/supabase/server";

export const PAGE_SIZE = 50;

export type AgencyFilters = {
  q?: string;
  country?: string;
  email?: "with" | "";
  page?: number;
};

export type AgencyRow = {
  id: string;
  name: string;
  identity_key: string;
  website_url: string | null;
  country_code: string | null;
  country_name: string | null;
  description: string | null;
  website_status: string | null;
  last_checked_at: string | null;
  agency_contacts: { email: string | null }[];
};

export function parseFilters(
  params: Record<string, string | string[] | undefined>,
): AgencyFilters {
  const value = (key: string) => {
    const v = params[key];
    return (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
  };
  return {
    q: value("q").slice(0, 100),
    country: /^[A-Z]{2}$|^none$/.test(value("country")) ? value("country") : "",
    email: value("email") === "with" ? "with" : "",
    page: Math.max(1, Number.parseInt(value("page") || "1", 10) || 1),
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
      `id, name, identity_key, website_url, country_code, country_name, description, website_status, last_checked_at, ${contacts}`,
      { count: "exact" },
    )
    .eq("workspace_id", workspaceId);

  if (filters.q) {
    const term = filters.q
      .replace(/[%,()*]/g, " ")
      .trim()
      .toLowerCase();
    if (term) {
      query = query.or(
        `normalized_name.ilike.%${term}%,identity_key.ilike.%${term}%,description.ilike.%${term}%`,
      );
    }
  }
  if (filters.country === "none") query = query.is("country_code", null);
  else if (filters.country) query = query.eq("country_code", filters.country);

  return query
    .order("name", { ascending: true })
    .order("id", { ascending: true })
    .range(offset, offset + limit - 1)
    .returns<AgencyRow[]>();
}
