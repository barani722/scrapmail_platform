import { cn } from "@/lib/utils";

type LogoProps = {
  className?: string;
  /** Hide the "Scrap&Mail" wordmark and show only the mark. */
  markOnly?: boolean;
};

/** Scrap&Mail logo: two overlapping blue panels, as in the approved designs. */
export function Logo({ className, markOnly = false }: LogoProps) {
  return (
    <span className={cn("inline-flex items-center gap-3", className)}>
      <svg viewBox="0 0 40 32" aria-hidden="true" className="h-8 w-10 shrink-0">
        <path d="M4 9.5 18 3.5v19L4 28.5z" fill="#7fb0ea" />
        <path d="M14 8.5 36 2.5v20l-22 7z" fill="#2465b3" />
      </svg>
      {!markOnly && (
        <span className="text-2xl font-semibold tracking-tight text-foreground">
          Scrap&amp;Mail
        </span>
      )}
    </span>
  );
}
