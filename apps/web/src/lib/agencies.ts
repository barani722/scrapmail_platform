import "server-only";

import { TOPIC_VALUES, topicKeywords } from "@/lib/agency-topics";
import { createClient } from "@/lib/supabase/server";

export const PAGE_SIZES = [25, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 50;

export const AGENCY_SORT_FIELDS = {
  name: "name",
  country: "country_code",
  relevance: "relevance",
  checked: "last_checked_at",
  added: "created_at",
} as const;
export type AgencySortField = keyof typeof AGENCY_SORT_FIELDS;

const RELEVANCE_FILTERS = ["A", "B", "C", "D", "E", "abc", "unrated"] as const;
const ORIGINS = ["import", "osm", "link", "search", "manual"] as const;
const CONTACTS = ["email", "no_email", "phone", "email_phone"] as const;
const ADDED = ["1d", "7d", "30d"] as const;
const ADDED_DAYS = { "1d": 1, "7d": 7, "30d": 30 } as const;

export type AgencyFilters = {
  q: string;
  /** Country codes; "none" = country unknown. Any of them matches. */
  countries: string[];
  /** "What they sell" topics; any of them matches. */
  topics: string[];
  contact: "" | (typeof CONTACTS)[number];
  added: "" | (typeof ADDED)[number];
  status: "" | "ok" | "blocked" | "dead" | "unchecked";
  relevance: "" | (typeof RELEVANCE_FILTERS)[number];
  origin: "" | (typeof ORIGINS)[number];
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
  city: string | null;
  website_status: string | null;
  last_checked_at: string | null;
  relevance: "A" | "B" | "C" | "D" | "E" | null;
  relevance_keywords: string[];
  origin: string;
  agency_contacts: { email: string | null }[];
};

type Params = Record<string, string | string[] | undefined>;

function oneOf<T extends string>(value: string, allowed: readonly T[]): T | "" {
  return (allowed as readonly string[]).includes(value) ? (value as T) : "";
}

export function parseFilters(params: Params): AgencyFilters {
  const value = (key: string) => {
    const v = params[key];
    return (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
  };
  const list = (key: string) =>
    value(key)
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
  const size = Number.parseInt(value("size"), 10);
  const [sortField, sortDir] = value("sort").split(".");
  // Older links used email=with|without.
  const legacyEmail = { with: "email", without: "no_email" }[value("email")];
  return {
    q: value("q").slice(0, 100),
    countries: [
      ...new Set(list("country").filter((c) => /^[A-Z]{2}$|^none$/.test(c))),
    ].slice(0, 250),
    topics: list("topic").filter((t) =>
      (TOPIC_VALUES as readonly string[]).includes(t),
    ),
    contact: oneOf(value("contact") || legacyEmail || "", CONTACTS),
    added: oneOf(value("added"), ADDED),
    status: oneOf(value("status"), [
      "ok",
      "blocked",
      "dead",
      "unchecked",
    ] as const),
    relevance: oneOf(value("relevance"), RELEVANCE_FILTERS),
    origin: oneOf(value("origin"), ORIGINS),
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

export function hasFilters(filters: AgencyFilters) {
  return Boolean(
    filters.q ||
    filters.countries.length ||
    filters.topics.length ||
    filters.contact ||
    filters.added ||
    filters.status ||
    filters.relevance ||
    filters.origin,
  );
}

/** Agency query with filters applied (RLS limits results to the workspace). */
export async function queryAgencies(
  workspaceId: string,
  filters: AgencyFilters,
  { limit, offset }: { limit: number; offset: number },
) {
  const supabase = await createClient();
  const needsEmail =
    filters.contact === "email" || filters.contact === "email_phone";
  const contacts = needsEmail
    ? "agency_contacts!inner(email)"
    : "agency_contacts(email)";
  let query = supabase
    .from("agencies")
    .select(
      `id, name, identity_key, website_url, country_code, country_name, description, phone, city, website_status, last_checked_at, relevance, relevance_keywords, origin, ${contacts}`,
      { count: "exact" },
    )
    .eq("workspace_id", workspaceId);

  // Conditions where any part may match; combined with AND at the end.
  const anyOf: string[] = [];

  const term = filters.q
    .replace(/[%,()*"\\]/g, " ")
    .trim()
    .toLowerCase();
  if (term) {
    const like = `%${term}%`;
    const parts = [
      `normalized_name.ilike.${like}`,
      `identity_key.ilike.${like}`,
      `description.ilike.${like}`,
      `city.ilike.${like}`,
      `phone.ilike.${like}`,
    ];
    // Email addresses live on contacts: find those agencies first.
    if (term.length >= 3) {
      const { data: matches } = await supabase
        .from("agency_contacts")
        .select("agency_id")
        .eq("workspace_id", workspaceId)
        .ilike("email", like)
        .limit(200)
        .returns<{ agency_id: string }[]>();
      const ids = [...new Set((matches ?? []).map((m) => m.agency_id))];
      if (ids.length) parts.push(`id.in.(${ids.join(",")})`);
    }
    anyOf.push(parts.join(","));
  }

  const codes = filters.countries.filter((c) => c !== "none");
  if (filters.countries.includes("none")) {
    anyOf.push(
      codes.length
        ? `country_code.is.null,country_code.in.(${codes.join(",")})`
        : "country_code.is.null",
    );
  } else if (codes.length) {
    query = query.in("country_code", codes);
  }

  if (anyOf.length === 1) query = query.or(anyOf[0]!);
  else if (anyOf.length > 1)
    query = query.or(`and(${anyOf.map((g) => `or(${g})`).join(",")})`);

  const keywords = topicKeywords(filters.topics);
  if (keywords.length) {
    query = query.overlaps(
      "relevance_keywords",
      `{${keywords.map((k) => `"${k}"`).join(",")}}`,
    );
  }

  if (needsEmail) query = query.not("agency_contacts.email", "is", null);
  if (filters.contact === "no_email") query = query.is("agency_contacts", null);
  if (filters.contact === "phone" || filters.contact === "email_phone")
    query = query.not("phone", "is", null);

  if (filters.added) {
    const since = Date.now() - ADDED_DAYS[filters.added] * 86_400_000;
    query = query.gte("created_at", new Date(since).toISOString());
  }

  if (filters.status === "ok") query = query.eq("website_status", "ok");
  else if (filters.status === "blocked")
    query = query.eq("website_status", "blocked");
  else if (filters.status === "dead")
    query = query.in("website_status", ["unreachable", "not_found", "error"]);
  else if (filters.status === "unchecked")
    query = query.is("last_checked_at", null);

  if (filters.relevance === "abc")
    query = query.in("relevance", ["A", "B", "C"]);
  else if (filters.relevance === "unrated") query = query.is("relevance", null);
  else if (filters.relevance) query = query.eq("relevance", filters.relevance);

  if (filters.origin) query = query.eq("origin", filters.origin);

  const column = AGENCY_SORT_FIELDS[filters.sort.field];
  return query
    .order(column, { ascending: filters.sort.dir === "asc", nullsFirst: false })
    .order("id", { ascending: true })
    .range(offset, offset + limit - 1)
    .returns<AgencyRow[]>();
}
