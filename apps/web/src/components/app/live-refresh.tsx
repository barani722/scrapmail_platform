"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

/**
 * scrape_jobs: scraper activity. Polled (one tiny query on active jobs), because
 * job progress changes with every finished task — too often for Realtime.
 * profiles: account changes (rare), via Supabase Realtime.
 */
type LiveTable = "scrape_jobs" | "profiles";

/**
 * Keeps the page in sync for every user and re-renders it with fresh data when
 * something changed. At most one refresh runs at a time, at most one per
 * `minIntervalMs`, and none while the tab is hidden (it catches up when shown).
 */
export function LiveRefresh({
  tables,
  workspaceId,
  minIntervalMs = 5000,
  className,
}: {
  tables: LiveTable[];
  workspaceId?: string;
  minIntervalMs?: number;
  className?: string;
}) {
  const router = useRouter();
  const [connected, setConnected] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const refreshingRef = useRef(false);
  const lastRefresh = useRef(0);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const key = tables.join(",");

  useEffect(() => {
    refreshingRef.current = refreshing;
  }, [refreshing]);

  useEffect(() => {
    const supabase = createClient();
    lastRefresh.current = Date.now(); // the page was just rendered with fresh data

    const schedule = (wait: number) => {
      if (timer.current) return;
      timer.current = setTimeout(run, Math.max(0, wait));
    };
    const run = () => {
      timer.current = null;
      if (!dirty.current || document.hidden) return;
      if (refreshingRef.current) {
        // The previous refresh is still loading: try again later.
        schedule(minIntervalMs);
        return;
      }
      dirty.current = false;
      lastRefresh.current = Date.now();
      startRefresh(() => router.refresh());
    };
    const onChange = () => {
      dirty.current = true;
      schedule(lastRefresh.current + minIntervalMs - Date.now());
    };
    const onVisible = () => {
      if (!document.hidden && dirty.current) schedule(0);
    };

    // Job progress: poll active jobs, refresh only when their progress changed.
    let progress: string | null = null;
    const poll = async () => {
      if (document.hidden) return;
      let query = supabase
        .from("scrape_jobs")
        .select("id, status, total_tasks, done_tasks, failed_tasks")
        .in("status", ["queued", "running"]);
      if (workspaceId) query = query.eq("workspace_id", workspaceId);
      const { data, error } = await query.order("id");
      if (error) return;
      setConnected(true);
      const next = JSON.stringify(data);
      if (progress !== null && next !== progress) onChange();
      progress = next;
    };
    const polling = key.split(",").includes("scrape_jobs")
      ? setInterval(() => void poll(), minIntervalMs)
      : null;
    if (polling) void poll();

    // Account changes: Realtime (rare events).
    const channel = key.split(",").includes("profiles")
      ? supabase
          .channel(`live:profiles:${Math.random().toString(36).slice(2)}`)
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "profiles" },
            onChange,
          )
          .subscribe((status) => setConnected(status === "SUBSCRIBED"))
      : null;
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      if (polling) clearInterval(polling);
      document.removeEventListener("visibilitychange", onVisible);
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      if (channel) void supabase.removeChannel(channel);
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
