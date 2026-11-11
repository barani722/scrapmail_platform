"use client";

import { Check, ChevronDown } from "lucide-react";
import { Select as SelectPrimitive } from "radix-ui";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type DropdownOption = {
  value: string;
  label: string;
  /** Small text on the right (e.g. a count). */
  hint?: string;
  /** Element before the label (e.g. a colored dot). */
  icon?: ReactNode;
};

// Radix Select does not allow "" as an item value; use a placeholder value.
const EMPTY = "__empty__";

/**
 * Styled, animated dropdown (Radix Select): keyboard accessible, with a check
 * mark on the selected item. `value` may be "" (e.g. "All countries").
 */
export function DropdownSelect({
  value,
  onValueChange,
  options,
  label,
  disabled,
  className,
  size = "default",
}: {
  value: string;
  onValueChange: (value: string) => void;
  options: DropdownOption[];
  label: string;
  disabled?: boolean;
  className?: string;
  size?: "default" | "sm";
}) {
  const selected = options.find((o) => o.value === value);
  return (
    <SelectPrimitive.Root
      value={value === "" ? EMPTY : value}
      onValueChange={(v) => onValueChange(v === EMPTY ? "" : v)}
      disabled={disabled}
    >
      <SelectPrimitive.Trigger
        aria-label={label}
        className={cn(
          "group inline-flex items-center justify-between gap-2 rounded-lg border border-input bg-background text-left text-sm shadow-xs transition-all outline-none",
          "hover:border-primary/50 hover:bg-muted/40 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20",
          "data-[state=open]:border-ring data-[state=open]:ring-[3px] data-[state=open]:ring-ring/20",
          "disabled:cursor-not-allowed disabled:opacity-50",
          size === "sm" ? "h-8 px-2.5" : "h-10 px-3",
          className,
        )}
      >
        <span className="flex min-w-0 items-center gap-2">
          {selected?.icon}
          <span className="truncate">
            <SelectPrimitive.Value placeholder={label} />
          </span>
        </span>
        <SelectPrimitive.Icon asChild>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>

      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={6}
          className={cn(
            "relative z-50 max-h-(--radix-select-content-available-height) min-w-(--radix-select-trigger-width) overflow-hidden rounded-xl border bg-popover p-1 text-popover-foreground shadow-lg",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
            "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
            "data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2",
          )}
        >
          <SelectPrimitive.Viewport className="max-h-80">
            {options.map((option) => (
              <SelectPrimitive.Item
                key={option.value || EMPTY}
                value={option.value === "" ? EMPTY : option.value}
                className="relative flex cursor-pointer items-center gap-2 rounded-md py-2 pr-8 pl-2.5 text-sm transition-colors outline-none select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[state=checked]:font-medium"
              >
                {option.icon}
                <SelectPrimitive.ItemText>
                  {option.label}
                </SelectPrimitive.ItemText>
                {option.hint && (
                  <span className="ml-auto pl-3 text-xs text-muted-foreground tabular-nums">
                    {option.hint}
                  </span>
                )}
                <SelectPrimitive.ItemIndicator className="absolute right-2 flex items-center">
                  <Check className="size-4 text-primary" />
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
