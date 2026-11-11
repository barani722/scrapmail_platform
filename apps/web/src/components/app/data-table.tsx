"use client";

import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Globe,
  Loader2,
  Search,
  X,
} from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";

import { Combobox } from "@/components/ui/combobox";
import {
  type DropdownOption,
  DropdownSelect,
} from "@/components/ui/dropdown-select";
import { ALL_COUNTRIES } from "@/lib/countries";
import { cn } from "@/lib/utils";

import { useUrlParams } from "./use-url-params";

/** Search box that updates the URL as you type (debounced). */
export function SearchInput({
  placeholder,
  param = "q",
  className,
}: {
  placeholder: string;
  param?: string;
  className?: string;
}) {
  const { searchParams, setParams, pending } = useUrlParams();
  const [value, setValue] = useState(searchParams.get(param) ?? "");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const update = (next: string) => {
    setValue(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(
      () => setParams({ [param]: next.trim() || null }),
      350,
    );
  };

  return (
    <div className={cn("relative min-w-56 flex-1", className)}>
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <input
        type="search"
        value={value}
        onChange={(e) => update(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-10 w-full rounded-lg border border-input bg-background pr-9 pl-9 text-sm transition-colors outline-none placeholder:text-muted-foreground/80 hover:border-primary/50 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20 [&::-webkit-search-cancel-button]:hidden"
      />
      {pending ? (
        <Loader2 className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
      ) : (
        value && (
          <button
            type="button"
            onClick={() => update("")}
            aria-label="Clear search"
            className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        )
      )}
    </div>
  );
}

/** Dropdown that applies its value to the URL immediately. */
export function FilterSelect({
  param,
  label,
  options,
  className,
}: {
  param: string;
  label: string;
  options: DropdownOption[];
  className?: string;
}) {
  const { searchParams, setParams } = useUrlParams();
  return (
    <DropdownSelect
      label={label}
      value={searchParams.get(param) ?? ""}
      onValueChange={(value) => setParams({ [param]: value || null })}
      options={options}
      className={className}
    />
  );
}

/**
 * Searchable country filter with every country in the world.
 * Countries that already have agencies are listed first with their count.
 */
export function CountryFilter({
  counts,
  unknown,
  className,
}: {
  counts: Record<string, number>;
  unknown: number;
  className?: string;
}) {
  const { searchParams, setParams } = useUrlParams();
  const withData = ALL_COUNTRIES.filter((c) => counts[c.code]).sort(
    (a, b) => (counts[b.code] ?? 0) - (counts[a.code] ?? 0),
  );
  const option = (c: { code: string; name: string }) => ({
    value: c.code,
    label: c.name,
    hint: counts[c.code] ? counts[c.code]!.toLocaleString() : undefined,
    keywords: [c.code],
    muted: !counts[c.code],
  });

  return (
    <Combobox
      label="All countries"
      searchPlaceholder="Search countries…"
      emptyText="No country found."
      icon={<Globe className="size-4 text-muted-foreground" />}
      value={searchParams.get("country") ?? ""}
      onValueChange={(value) => setParams({ country: value || null })}
      className={cn("w-56", className)}
      groups={[
        {
          options: [
            { value: "", label: "All countries" },
            ...(unknown
              ? [
                  {
                    value: "none",
                    label: "Unknown country",
                    hint: unknown.toLocaleString(),
                  },
                ]
              : []),
          ],
        },
        { heading: "In your database", options: withData.map(option) },
        { heading: "All countries", options: ALL_COUNTRIES.map(option) },
      ]}
    />
  );
}

/** "1–50 of 2,738", first/prev/next/last buttons and rows-per-page. */
export function Pagination({
  page,
  pageSize,
  total,
  className,
}: {
  page: number;
  pageSize: number;
  total: number;
  className?: string;
}) {
  const { setParams, pending } = useUrlParams();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const go = (p: number) =>
    setParams({ page: p > 1 ? String(p) : null }, { resetPage: false });

  const button = (
    target: number,
    disabled: boolean,
    label: string,
    icon: ReactNode,
  ) => (
    <button
      type="button"
      onClick={() => go(target)}
      disabled={disabled || pending}
      aria-label={label}
      title={label}
      className="flex size-8 items-center justify-center rounded-md border bg-background text-muted-foreground transition-all hover:border-primary/50 hover:text-foreground active:scale-90 disabled:pointer-events-none disabled:opacity-40"
    >
      {icon}
    </button>
  );

  return (
    <div className={cn("flex flex-wrap items-center gap-3 text-sm", className)}>
      <span className="text-muted-foreground tabular-nums">
        {from.toLocaleString()}–{to.toLocaleString()} of{" "}
        {total.toLocaleString()}
      </span>
      <div className="flex items-center gap-1">
        {button(
          1,
          page <= 1,
          "First page",
          <ChevronsLeft className="size-4" />,
        )}
        {button(
          page - 1,
          page <= 1,
          "Previous page",
          <ChevronLeft className="size-4" />,
        )}
        <span className="min-w-20 text-center tabular-nums">
          {page} / {pages.toLocaleString()}
        </span>
        {button(
          page + 1,
          page >= pages,
          "Next page",
          <ChevronRight className="size-4" />,
        )}
        {button(
          pages,
          page >= pages,
          "Last page",
          <ChevronsRight className="size-4" />,
        )}
      </div>
      <DropdownSelect
        label="Rows per page"
        size="sm"
        value={String(pageSize)}
        onValueChange={(value) =>
          setParams({ size: value === "50" ? null : value })
        }
        options={[25, 50, 100].map((n) => ({
          value: String(n),
          label: `${n} / page`,
        }))}
      />
    </div>
  );
}

/** Column header that sorts by a field; click again to reverse. */
export function SortHeader({
  field,
  children,
  current,
}: {
  field: string;
  children: ReactNode;
  current: { field: string; dir: "asc" | "desc" };
}) {
  const { setParams } = useUrlParams();
  const active = current.field === field;
  const next = active && current.dir === "asc" ? "desc" : "asc";
  const Icon = !active
    ? ArrowUpDown
    : current.dir === "asc"
      ? ArrowUp
      : ArrowDown;
  return (
    <button
      type="button"
      onClick={() => setParams({ sort: `${field}.${next}` })}
      className={cn(
        "group inline-flex items-center gap-1 font-medium transition-colors hover:text-foreground",
        active && "text-foreground",
      )}
    >
      {children}
      <Icon
        className={cn(
          "size-3.5 transition-opacity",
          active ? "opacity-100" : "opacity-40 group-hover:opacity-100",
        )}
      />
    </button>
  );
}

/** Scrollable table area with a sticky header, sized to the viewport. */
export function TableFrame({ children }: { children: ReactNode }) {
  return (
    <div className="max-h-[calc(100dvh-17rem)] min-h-64 overflow-auto rounded-xl border bg-card shadow-sm [&_thead]:sticky [&_thead]:top-0 [&_thead]:z-10 [&_thead]:shadow-[0_1px_0_var(--border)]">
      {children}
    </div>
  );
}
