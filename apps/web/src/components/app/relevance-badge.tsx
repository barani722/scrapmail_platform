import { StatusBadge, type Tone } from "./status-badge";

export const RELEVANCE: Record<string, { label: string; tone: Tone }> = {
  A: { label: "Tickets & hospitality", tone: "success" },
  B: { label: "Sports & event travel", tone: "info" },
  C: { label: "Travel & concierge", tone: "neutral" },
  D: { label: "Weak match", tone: "warning" },
  E: { label: "No match", tone: "danger" },
};

/** A–E relevance pill; hovering shows the keywords that produced the rating. */
export function RelevanceBadge({
  level,
  keywords = [],
  showLabel = false,
}: {
  level: string | null;
  keywords?: string[];
  showLabel?: boolean;
}) {
  if (!level) return <span className="text-muted-foreground">—</span>;
  const info = RELEVANCE[level];
  const title = `${level} · ${info?.label ?? ""}${keywords.length ? `\nMatched: ${keywords.join(", ")}` : ""}`;
  return (
    <span title={title} className="cursor-help">
      <StatusBadge tone={info?.tone ?? "neutral"} className="normal-case">
        <span className="font-bold">{level}</span>
        {showLabel && info && <span className="ml-1.5">{info.label}</span>}
      </StatusBadge>
    </span>
  );
}
