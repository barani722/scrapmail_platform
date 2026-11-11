"use client";

import { Loader2, Play } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { DropdownSelect } from "@/components/ui/dropdown-select";

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
