"use client";

import { Command } from "cmdk";
import { Check, ChevronDown, Globe, Search, Tags, X } from "lucide-react";
import { Popover } from "radix-ui";
import { type ReactNode, useState } from "react";

import { AGENCY_TOPICS } from "@/lib/agency-topics";
import { ALL_COUNTRIES, countryName, searchable } from "@/lib/countries";
import { REGIONS } from "@/lib/regions";
import { cn } from "@/lib/utils";

import { useUrlParams } from "./use-url-params";

type Option = { value: string; label: string; hint?: string };

/** Every URL parameter that filters the agency list (cleared by views / "Clear all"). */
const FILTER_PARAMS = [
  "q",
  "country",
  "topic",
  "contact",
  "email",
  "added",
  "status",
  "relevance",
  "origin",
  "sort",
] as const;

const listParam = (value: string | null) =>
  (value ?? "").split(",").filter(Boolean);

/** Multi-select popover bound to a comma-separated URL parameter. */
function MultiFilter({
  param,
  placeholder,
  icon,
  groups,
  presets = [],
  searchPlaceholder,
  summary,
  className,
}: {
  param: string;
  placeholder: string;
  icon: ReactNode;
  groups: { heading?: string; options: Option[] }[];
  presets?: { label: string; values: string[] }[];
  searchPlaceholder?: string;
  summary: (values: string[]) => string;
  className?: string;
}) {
  const { searchParams, setParams } = useUrlParams();
  const [open, setOpen] = useState(false);
  const value = listParam(searchParams.get(param));
  const selected = new Set(value);
  const apply = (next: string[]) =>
    setParams({ [param]: next.length ? next.join(",") : null });
  const toggle = (v: string) =>
    apply(selected.has(v) ? value.filter((x) => x !== v) : [...value, v]);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        className={cn(
          "group inline-flex h-10 w-56 items-center justify-between gap-2 rounded-lg border border-input bg-background px-3 text-left text-sm shadow-xs transition-all outline-none",
          "hover:border-primary/50 hover:bg-muted/40 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20",
          "data-[state=open]:border-ring data-[state=open]:ring-[3px] data-[state=open]:ring-ring/20",
          value.length > 0 && "border-primary/60 bg-accent/40",
          className,
        )}
      >
        <span className="flex min-w-0 items-center gap-2">
          {icon}
          <span className="truncate">
            {value.length ? summary(value) : placeholder}
          </span>
        </span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          className="z-50 w-80 overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-lg data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:slide-in-from-top-2"
        >
          <Command
            filter={(itemValue, search, keywords) =>
              searchable(`${itemValue} ${(keywords ?? []).join(" ")}`).includes(
                searchable(search.trim()),
              )
                ? 1
                : 0
            }
          >
            {searchPlaceholder && (
              <div className="flex items-center gap-2 border-b px-3">
                <Search className="size-4 shrink-0 text-muted-foreground" />
                <Command.Input
                  autoFocus
                  placeholder={searchPlaceholder}
                  className="h-10 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
              </div>
            )}
            {(presets.length > 0 || value.length > 0) && (
              <div className="flex flex-wrap gap-1.5 border-b px-3 py-2">
                {presets.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => apply(preset.values)}
                    className="rounded-full border px-2.5 py-1 text-xs transition-all hover:border-primary/50 hover:bg-accent active:scale-95"
                  >
                    {preset.label}
                  </button>
                ))}
                {value.length > 0 && (
                  <button
                    type="button"
                    onClick={() => apply([])}
                    className="rounded-full px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                  >
                    Clear ({value.length})
                  </button>
                )}
              </div>
            )}
            <Command.List className="max-h-80 overflow-y-auto overscroll-contain p-1">
              <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
                Nothing found.
              </Command.Empty>
              {groups.map((group, gi) => (
                <Command.Group
                  key={group.heading ?? gi}
                  heading={group.heading}
                  className="[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground"
                >
                  {group.options.map((o) => {
                    const checked = selected.has(o.value);
                    return (
                      <Command.Item
                        key={`${gi}-${o.value}`}
                        value={`${o.label}__${o.value}__${gi}`}
                        keywords={[o.value]}
                        onSelect={() => toggle(o.value)}
                        className="flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors outline-none select-none data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
                      >
                        <span
                          className={cn(
                            "flex size-4 shrink-0 items-center justify-center rounded border transition-colors",
                            checked
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-input",
                          )}
                        >
                          {checked && <Check className="size-3" />}
                        </span>
                        <span className="truncate">{o.label}</span>
                        {o.hint && (
                          <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                            {o.hint}
                          </span>
                        )}
                      </Command.Item>
                    );
                  })}
                </Command.Group>
              ))}
            </Command.List>
          </Command>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** Several countries at once, with region shortcuts and agency counts. */
export function CountriesFilter({
  counts,
  unknown,
}: {
  counts: Record<string, number>;
  unknown: number;
}) {
  const option = (c: { code: string; name: string }): Option => ({
    value: c.code,
    label: c.name,
    hint: counts[c.code] ? counts[c.code]!.toLocaleString() : undefined,
  });
  const withData = ALL_COUNTRIES.filter((c) => counts[c.code]).sort(
    (a, b) => (counts[b.code] ?? 0) - (counts[a.code] ?? 0),
  );
  return (
    <MultiFilter
      param="country"
      placeholder="All countries"
      icon={<Globe className="size-4 shrink-0 text-muted-foreground" />}
      searchPlaceholder="Search countries…"
      presets={REGIONS.map((r) => ({ label: r.label, values: r.codes }))}
      summary={(v) =>
        v.length <= 2
          ? v.map((c) => (c === "none" ? "Unknown" : countryName(c))).join(", ")
          : `${v.length} countries`
      }
      groups={[
        ...(unknown
          ? [
              {
                options: [
                  {
                    value: "none",
                    label: "Unknown country",
                    hint: unknown.toLocaleString(),
                  },
                ],
              },
            ]
          : []),
        { heading: "In your database", options: withData.map(option) },
        {
          heading: "All countries",
          options: ALL_COUNTRIES.filter((c) => !counts[c.code]).map(option),
        },
      ]}
    />
  );
}

/** "What they sell": football, F1, concerts, theatre … (any of them). */
export function TopicsFilter() {
  return (
    <MultiFilter
      param="topic"
      placeholder="What they sell"
      icon={<Tags className="size-4 shrink-0 text-muted-foreground" />}
      summary={(v) =>
        v.length === 1
          ? (AGENCY_TOPICS.find((t) => t.value === v[0])?.label ?? v[0]!)
          : `${v.length} topics`
      }
      groups={[
        {
          options: AGENCY_TOPICS.map((t) => ({
            value: t.value,
            label: t.label,
          })),
        },
      ]}
    />
  );
}

/** One-click views for the most common lists. */
const VIEWS: { label: string; params: Record<string, string> }[] = [
  { label: "All agencies", params: {} },
  { label: "Ready to email", params: { relevance: "abc", contact: "email" } },
  {
    label: "Ticket & hospitality sellers",
    params: { relevance: "A", contact: "email" },
  },
  { label: "Need an email", params: { relevance: "abc", contact: "no_email" } },
  { label: "New this week", params: { added: "7d", sort: "added.desc" } },
];

export function QuickViews() {
  const { searchParams, setParams } = useUrlParams();
  const current = Object.fromEntries(
    FILTER_PARAMS.flatMap((p) => {
      const v = searchParams.get(p);
      return v ? [[p, v]] : [];
    }),
  );
  const isActive = (params: Record<string, string>) => {
    const keys = Object.keys(current);
    return (
      keys.length === Object.keys(params).length &&
      keys.every((k) => current[k] === params[k])
    );
  };

  return (
    <div
      role="toolbar"
      aria-label="Quick views"
      className="mb-3 flex flex-wrap gap-2"
    >
      {VIEWS.map((view) => {
        const active = isActive(view.params);
        return (
          <button
            key={view.label}
            type="button"
            aria-pressed={active}
            onClick={() =>
              setParams({
                ...Object.fromEntries(FILTER_PARAMS.map((p) => [p, null])),
                ...view.params,
              })
            }
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm transition-all active:scale-95",
              active
                ? "border-primary bg-primary text-primary-foreground"
                : "hover:border-primary/50 hover:bg-accent",
            )}
          >
            {view.label}
          </button>
        );
      })}
    </div>
  );
}

const LABELS: Record<string, Record<string, string>> = {
  contact: {
    email: "With email",
    no_email: "Without email",
    phone: "With phone",
    email_phone: "With email and phone",
  },
  email: { with: "With email", without: "Without email" },
  added: {
    "1d": "Added today",
    "7d": "Added this week",
    "30d": "Added this month",
  },
  relevance: {
    abc: "Relevant (A–C)",
    A: "Rated A",
    B: "Rated B",
    C: "Rated C",
    D: "Rated D",
    E: "Rated E",
    unrated: "Not rated yet",
  },
  origin: {
    import: "Client import",
    osm: "OpenStreetMap",
    link: "Agency links",
    search: "Web search",
    manual: "Added manually",
  },
  status: {
    ok: "Website checked",
    unchecked: "Not checked yet",
    blocked: "Website blocked",
    dead: "Website offline",
  },
};

/** Chips for every active filter (click to remove) and "Clear all". */
export function ActiveFilters() {
  const { searchParams, setParams } = useUrlParams();
  const chips: { key: string; label: string; remove: () => void }[] = [];

  const q = searchParams.get("q");
  if (q)
    chips.push({
      key: "q",
      label: `“${q}”`,
      remove: () => setParams({ q: null }),
    });

  for (const param of ["country", "topic"] as const) {
    const values = listParam(searchParams.get(param));
    for (const v of values) {
      const label =
        param === "country"
          ? v === "none"
            ? "Unknown country"
            : (countryName(v) ?? v)
          : (AGENCY_TOPICS.find((t) => t.value === v)?.label ?? v);
      chips.push({
        key: `${param}-${v}`,
        label,
        remove: () =>
          setParams({
            [param]: values.filter((x) => x !== v).join(",") || null,
          }),
      });
    }
  }

  for (const param of Object.keys(LABELS)) {
    const v = searchParams.get(param);
    if (v)
      chips.push({
        key: param,
        label: LABELS[param]![v] ?? v,
        remove: () => setParams({ [param]: null }),
      });
  }

  if (!chips.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          onClick={chip.remove}
          aria-label={`Remove filter ${chip.label}`}
          className="group inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground transition-colors hover:bg-accent/70"
        >
          {chip.label}
          <X className="size-3 opacity-60 transition-opacity group-hover:opacity-100" />
        </button>
      ))}
      <button
        type="button"
        onClick={() =>
          setParams(Object.fromEntries(FILTER_PARAMS.map((p) => [p, null])))
        }
        className="px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        Clear all
      </button>
    </div>
  );
}
