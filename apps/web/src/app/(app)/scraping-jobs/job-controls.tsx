"use client";

import { Loader2, Play } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";

import { cancelJob, createEnrichJob } from "./actions";

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
      <Select
        aria-label="Which agencies"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        disabled={pending}
      >
        <option value="missing_email">Agencies without an email</option>
        <option value="never_checked">Agencies never checked</option>
        <option value="all">All agencies with a website</option>
      </Select>
      <Button onClick={start} disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : <Play />}
        {pending ? "Starting…" : "Start job"}
      </Button>
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
