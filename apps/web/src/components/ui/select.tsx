import { ChevronDown } from "lucide-react";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

/**
 * Native <select> with a custom chevron placed right next to the text
 * (the browser's own arrow is hidden). Keeps native keyboard/mobile behavior.
 */
function Select({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <div className={cn("relative inline-flex", className)}>
      <select
        data-slot="select"
        className="h-10 w-full cursor-pointer appearance-none rounded-lg border border-input bg-background pr-9 pl-3 text-sm transition-colors outline-none hover:border-primary/50 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-50"
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  );
}

export { Select };
