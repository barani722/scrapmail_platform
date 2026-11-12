import { Activity, Gauge, RotateCcw, Timer, Zap } from "lucide-react";

import { StatusBadge } from "@/components/app/status-badge";

export type WorkerStatus = {
  worker_id: string;
  state: "running" | "stopped";
  updated_at: string;
  concurrency: number | null;
  running: number | null;
  tasks_per_minute: number | null;
  loop_lag_ms: number | null;
  oldest_task_seconds: number | null;
  restarts: number;
};

/** A worker reports every 30 s; older than this means it is not running. */
const ONLINE_SECONDS = 90;

function ago(seconds: number) {
  if (seconds < 90) return `${Math.round(seconds)} s ago`;
  if (seconds < 5400) return `${Math.round(seconds / 60)} min ago`;
  return `${Math.round(seconds / 3600)} h ago`;
}

/** Live health of the scraping worker: speed, autopilot and supervisor restarts. */
export function WorkerHealth({
  status,
  now,
}: {
  status: WorkerStatus | null;
  now: number;
}) {
  const age = status
    ? (now - new Date(status.updated_at).getTime()) / 1000
    : Infinity;
  const online = status?.state === "running" && age < ONLINE_SECONDS;
  const lag = status?.loop_lag_ms ?? 0;

  return (
    <section
      aria-label="Worker status"
      className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border bg-card px-6 py-4 shadow-sm"
    >
      <div className="flex items-center gap-2">
        <Activity className="size-4 text-muted-foreground" />
        <span className="font-semibold">Worker</span>
        <StatusBadge tone={online ? "success" : "warning"}>
          {online ? "Online" : "Offline"}
        </StatusBadge>
      </div>
      {online && status ? (
        <>
          <Metric
            icon={<Zap className="size-4" />}
            label="Speed"
            value={`${(status.tasks_per_minute ?? 0).toLocaleString()} tasks/min`}
          />
          <Metric
            icon={<Gauge className="size-4" />}
            label="Autopilot"
            value={`${status.running ?? 0} of ${status.concurrency ?? 0} at once`}
          />
          <Metric
            icon={<Timer className="size-4" />}
            label="Load"
            value={lag > 500 ? "high" : lag > 100 ? "medium" : "normal"}
          />
          <Metric
            icon={<RotateCcw className="size-4" />}
            label="Auto restarts"
            value={status.restarts.toLocaleString()}
          />
          <span className="ml-auto text-xs text-muted-foreground">
            Updated {ago(age)}
          </span>
        </>
      ) : (
        <span className="text-sm text-muted-foreground">
          {status
            ? `Last report ${ago(age)}. Jobs wait in the queue until the worker runs again.`
            : "No worker has reported yet. Jobs wait in the queue until the worker runs."}
        </span>
      )}
    </section>
  );
}

function Metric({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">{icon}</span>
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}
