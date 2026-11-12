import { Activity, Cpu, Gauge, RotateCcw, Timer, Zap } from "lucide-react";

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

/**
 * Live health of the scraping workers (the supervisor runs one or more,
 * depending on the machine's capacity): speed, autopilot and restarts.
 */
export function WorkerHealth({
  statuses,
  now,
}: {
  statuses: WorkerStatus[];
  now: number;
}) {
  const age = (s: WorkerStatus) =>
    (now - new Date(s.updated_at).getTime()) / 1000;
  const online = statuses.filter(
    (s) => s.state === "running" && age(s) < ONLINE_SECONDS,
  );
  const latest = statuses[0];
  const sum = (pick: (s: WorkerStatus) => number | null) =>
    online.reduce((total, s) => total + (pick(s) ?? 0), 0);
  const lag = Math.max(0, ...online.map((s) => s.loop_lag_ms ?? 0));
  const restarts = Math.max(0, ...online.map((s) => s.restarts));

  return (
    <section
      aria-label="Worker status"
      className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border bg-card px-6 py-4 shadow-sm"
    >
      <div className="flex items-center gap-2">
        <Activity className="size-4 text-muted-foreground" />
        <span className="font-semibold">Worker</span>
        <StatusBadge tone={online.length ? "success" : "warning"}>
          {online.length ? "Online" : "Offline"}
        </StatusBadge>
      </div>
      {online.length ? (
        <>
          <Metric
            icon={<Cpu className="size-4" />}
            label="Processes"
            value={online.length.toLocaleString()}
          />
          <Metric
            icon={<Zap className="size-4" />}
            label="Speed"
            value={`${sum((s) => s.tasks_per_minute).toLocaleString()} tasks/min`}
          />
          <Metric
            icon={<Gauge className="size-4" />}
            label="Autopilot"
            value={`${sum((s) => s.running)} of ${sum((s) => s.concurrency)} at once`}
          />
          <Metric
            icon={<Timer className="size-4" />}
            label="Load"
            value={lag > 500 ? "high" : lag > 100 ? "medium" : "normal"}
          />
          <Metric
            icon={<RotateCcw className="size-4" />}
            label="Auto restarts"
            value={restarts.toLocaleString()}
          />
          <span className="ml-auto text-xs text-muted-foreground">
            Updated {ago(Math.min(...online.map(age)))}
          </span>
        </>
      ) : (
        <span className="text-sm text-muted-foreground">
          {latest
            ? `Last report ${ago(age(latest))}. Jobs wait in the queue until the worker runs again.`
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
