"use client";

import { Eye, EyeOff, type LucideIcon } from "lucide-react";
import { type ComponentProps, useState } from "react";

import { Input } from "@/components/ui/input";

type IconInputProps = ComponentProps<typeof Input> & { icon: LucideIcon };

/** Text input with a leading icon, as in the auth designs. */
export function IconInput({ icon: Icon, ...props }: IconInputProps) {
  return (
    <div className="relative">
      <Icon
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground"
      />
      <Input className="pl-12" {...props} />
    </div>
  );
}

/** Password input with a leading icon and a show/hide toggle. */
export function PasswordInput({ icon: Icon, ...props }: IconInputProps) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Icon
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        className="pr-12 pl-12"
        type={visible ? "text" : "password"}
        {...props}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="absolute top-1/2 right-3 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:text-foreground"
        aria-label={visible ? "Hide password" : "Show password"}
      >
        {visible ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
      </button>
    </div>
  );
}
