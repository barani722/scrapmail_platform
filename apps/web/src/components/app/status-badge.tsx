import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type Tone = "success" | "warning" | "danger" | "info" | "neutral";

const TONES: Record<Tone, string> = {
  success: "bg-success-surface text-success",
  warning: "bg-warning-surface text-warning",
  danger: "bg-danger-surface text-danger",
  info: "bg-info-surface text-info",
  neutral: "bg-neutral-surface text-neutral",
};

/** Small colored pill; colors adapt to light and dark themes. */
export function StatusBadge({
  tone,
  children,
  className,
}: {
  tone: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize transition-colors duration-300",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
