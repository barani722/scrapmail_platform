import { Loader2 } from "lucide-react";

import { StatusBadge, type Tone } from "./status-badge";

export type JobStatus =
  "queued" | "running" | "completed" | "failed" | "cancelled";

const TONE: Record<JobStatus, Tone> = {
  queued: "neutral",
  running: "info",
  completed: "success",
  failed: "danger",
  cancelled: "neutral",
};

export function JobStatusBadge({ status }: { status: JobStatus }) {
  return (
    <StatusBadge tone={TONE[status]} className="gap-1">
      {status === "running" && <Loader2 className="size-3 animate-spin" />}
      {status}
    </StatusBadge>
  );
}

export function JobProgress({
  done,
  failed,
  total,
  running = false,
}: {
  done: number;
  failed: number;
  total: number;
  running?: boolean;
}) {
  const pct = total ? Math.round(((done + failed) / total) * 100) : 0;
  return (
    <div className="min-w-40">
      <div className="relative h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-700 ease-out"
          style={{ width: `${pct}%` }}
        />
        {running && (
          <div className="absolute inset-0 animate-pulse bg-gradient-to-r from-transparent via-white/25 to-transparent" />
        )}
      </div>
      <p className="mt-1 text-xs text-muted-foreground tabular-nums">
        {(done + failed).toLocaleString()} / {total.toLocaleString()} ({pct}%)
        {failed > 0 && (
          <span className="text-danger">
            {" "}
            · {failed.toLocaleString()} failed
          </span>
        )}
      </p>
    </div>
  );
}
