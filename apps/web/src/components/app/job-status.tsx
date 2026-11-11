import { cn } from "@/lib/utils";

export type JobStatus =
  "queued" | "running" | "completed" | "failed" | "cancelled";

const STYLE: Record<JobStatus, string> = {
  queued: "bg-slate-100 text-slate-700",
  running: "bg-blue-50 text-blue-800",
  completed: "bg-green-50 text-green-800",
  failed: "bg-red-50 text-red-700",
  cancelled: "bg-slate-100 text-slate-500",
};

export function JobStatusBadge({ status }: { status: JobStatus }) {
  return (
    <span
      className={cn(
        "rounded-full px-2.5 py-1 text-xs font-medium capitalize",
        STYLE[status],
      )}
    >
      {status}
    </span>
  );
}

export function JobProgress({
  done,
  failed,
  total,
}: {
  done: number;
  failed: number;
  total: number;
}) {
  const pct = total ? Math.round(((done + failed) / total) * 100) : 0;
  return (
    <div className="min-w-40">
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full bg-primary transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {(done + failed).toLocaleString()} / {total.toLocaleString()} ({pct}%)
        {failed > 0 && (
          <span className="text-destructive"> · {failed} failed</span>
        )}
      </p>
    </div>
  );
}
