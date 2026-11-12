"use client";

import { Loader2, Play, Search } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { DropdownSelect } from "@/components/ui/dropdown-select";
import { MultiCountrySelect } from "@/components/ui/multi-country-select";
import {
  DISCOVERY_SOURCES,
  type DiscoverySource,
  MAIN_MARKETS,
  SEARCH_PHRASES,
} from "@/lib/discovery";
import { cn } from "@/lib/utils";

import { cancelJob, createDiscoveryJob, createEnrichJob } from "./actions";

export function NewJobForm() {
  const [filter, setFilter] = useState("missing_email");
  const [pending, startTransition] = useTransition();

  const start = () =>
    startTransition(async () => {
      const result = await createEnrichJob(filter);
      if (result.ok) toast.success(result.message);
      else toast.error(result.error);
    });

  return (
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <DropdownSelect
        label="Which agencies"
        value={filter}
        onValueChange={setFilter}
        disabled={pending}
        className="w-64"
        options={[
          { value: "missing_email", label: "Agencies without an email" },
          { value: "never_checked", label: "Agencies never checked" },
          { value: "all", label: "All agencies with a website" },
        ]}
      />
      <Button onClick={start} disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : <Play />}
        {pending ? "Starting…" : "Start job"}
      </Button>
    </div>
  );
}

export function DiscoveryForm({
  searchUsed,
  searchLimit,
  linkSites,
}: {
  searchUsed: number;
  searchLimit: number;
  linkSites: number;
}) {
  const [source, setSource] = useState<DiscoverySource>("osm");
  const [countries, setCountries] = useState<string[]>(MAIN_MARKETS);
  const [queries, setQueries] = useState<string[]>([...SEARCH_PHRASES]);
  const [pending, startTransition] = useTransition();

  const searches = countries.length * queries.length;
  const remaining = Math.max(0, searchLimit - searchUsed);
  const estimate =
    source === "osm"
      ? `${countries.length} ${countries.length === 1 ? "country" : "countries"} · free`
      : source === "links"
        ? `${linkSites.toLocaleString()} agency websites · free`
        : `${searches.toLocaleString()} searches · ${remaining.toLocaleString()} free searches left this month`;

  const start = () =>
    startTransition(async () => {
      const result = await createDiscoveryJob({ source, countries, queries });
      if (result.ok) toast.success(result.message);
      else toast.error(result.error);
    });

  return (
    <div className="mt-4 space-y-4">
      <div
        role="radiogroup"
        aria-label="Discovery source"
        className="grid gap-3 md:grid-cols-3"
      >
        {DISCOVERY_SOURCES.map((option) => {
          const active = option.value === source;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setSource(option.value)}
              className={cn(
                "rounded-xl border p-4 text-left transition-all duration-200 hover:border-primary/50 active:scale-[0.99]",
                active &&
                  "border-primary bg-accent/60 shadow-sm ring-2 ring-primary/20",
              )}
            >
              <span className="flex items-center justify-between gap-2 font-semibold">
                {option.label}
                <StatusBadge tone={option.free ? "success" : "info"}>
                  {option.free ? "Free" : "Free credit"}
                </StatusBadge>
              </span>
              <span className="mt-1 block text-sm text-muted-foreground">
                {option.description}
              </span>
            </button>
          );
        })}
      </div>

      {source !== "links" && (
        <div className="flex animate-in flex-wrap items-center gap-3 fade-in">
          <MultiCountrySelect
            value={countries}
            onChange={setCountries}
            presets={[{ label: "Main markets", codes: MAIN_MARKETS }]}
            disabled={pending}
          />
        </div>
      )}

      {source === "search" && (
        <fieldset className="animate-in fade-in">
          <legend className="mb-2 text-sm font-medium">Search phrases</legend>
          <div className="flex flex-wrap gap-2">
            {SEARCH_PHRASES.map((phrase) => {
              const on = queries.includes(phrase);
              return (
                <button
                  key={phrase}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    setQueries(
                      on
                        ? queries.filter((q) => q !== phrase)
                        : [...queries, phrase],
                    )
                  }
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-sm transition-all active:scale-95",
                    on
                      ? "border-primary bg-primary text-primary-foreground"
                      : "hover:border-primary/50 hover:bg-accent",
                  )}
                >
                  {phrase}
                </button>
              );
            })}
          </div>
        </fieldset>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={start} disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <Search />}
          {pending ? "Starting…" : "Find new agencies"}
        </Button>
        <span
          className={cn(
            "text-sm text-muted-foreground",
            source === "search" && searches > remaining && "text-warning",
          )}
        >
          {estimate}
          {source === "search" &&
            searches > remaining &&
            " — searches beyond the free limit will be skipped"}
        </span>
      </div>
    </div>
  );
}

export function CancelJobButton({ jobId }: { jobId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await cancelJob(jobId);
          if (result.ok) toast.success(result.message);
          else toast.error(result.error);
        })
      }
    >
      {pending && <Loader2 className="animate-spin" />}
      Cancel
    </Button>
  );
}
