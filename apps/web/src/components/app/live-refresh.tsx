"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type LiveTable = "agencies" | "agency_contacts" | "scrape_jobs" | "profiles";

/**
 * Keeps the page in sync for every user: listens to database changes
 * (Supabase Realtime, filtered by RLS) and re-renders the page with fresh data.
 * Refreshes are throttled so a busy scraper does not flood the browser.
 */
export function LiveRefresh({
  tables,
  workspaceId,
  minIntervalMs = 2000,
  className,
}: {
  tables: LiveTable[];
  workspaceId?: string;
  minIntervalMs?: number;
  className?: string;
}) {
  const router = useRouter();
  const [connected, setConnected] = useState(false);
  const lastRefresh = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const key = tables.join(",");

  useEffect(() => {
    const supabase = createClient();
    const schedule = () => {
      if (timer.current) return;
      const wait = Math.max(
        0,
        lastRefresh.current + minIntervalMs - Date.now(),
      );
      timer.current = setTimeout(() => {
        timer.current = null;
        lastRefresh.current = Date.now();
        router.refresh();
      }, wait);
    };

    const channel = supabase.channel(
      `live:${key}:${Math.random().toString(36).slice(2)}`,
    );
    for (const table of key.split(",")) {
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table,
          ...(workspaceId && table !== "profiles"
            ? { filter: `workspace_id=eq.${workspaceId}` }
            : {}),
        },
        schedule,
      );
    }
    channel.subscribe((status) => setConnected(status === "SUBSCRIBED"));

    return () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      void supabase.removeChannel(channel);
    };
  }, [key, workspaceId, minIntervalMs, router]);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors duration-500",
        connected
          ? "bg-success-surface text-success"
          : "bg-neutral-surface text-neutral",
        className,
      )}
      title={
        connected
          ? "Updates appear automatically"
          : "Connecting to live updates…"
      }
    >
      <span className="relative flex size-2">
        {connected && (
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60" />
        )}
        <span
          className={cn(
            "relative inline-flex size-2 rounded-full",
            connected ? "bg-success" : "bg-neutral",
          )}
        />
      </span>
      {connected ? "Live" : "Connecting"}
    </span>
  );
}
