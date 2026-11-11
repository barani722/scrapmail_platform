"use client";

import { Check, Copy, KeyRound, Loader2, RefreshCw } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DropdownSelect } from "@/components/ui/dropdown-select";
import { cn } from "@/lib/utils";

import { resetUserPassword, setAccountStatus } from "./actions";

const STATUSES = ["pending", "approved", "rejected", "suspended"] as const;

const DOT: Record<(typeof STATUSES)[number], string> = {
  pending: "bg-warning",
  approved: "bg-success",
  rejected: "bg-neutral",
  suspended: "bg-danger",
};

export function StatusSelect({
  userId,
  status,
  disabled,
}: {
  userId: string;
  status: string;
  disabled?: boolean;
}) {
  const [value, setValue] = useState(status);
  const [pending, startTransition] = useTransition();

  const change = (next: string) => {
    const previous = value;
    setValue(next);
    startTransition(async () => {
      const result = await setAccountStatus(userId, next);
      if (result.ok) {
        toast.success(result.message);
      } else {
        setValue(previous);
        toast.error(result.error);
      }
    });
  };

  return (
    <div className="flex items-center gap-2">
      <DropdownSelect
        label="Account status"
        value={value}
        disabled={disabled || pending}
        onValueChange={(next) => next !== value && change(next)}
        className="w-40"
        options={STATUSES.map((s) => ({
          value: s,
          label: s[0]?.toUpperCase() + s.slice(1),
          icon: <span className={cn("size-2 shrink-0 rounded-full", DOT[s])} />,
        }))}
      />
      {pending && (
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      )}
    </div>
  );
}

function generatePassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%";
  const values = crypto.getRandomValues(new Uint32Array(14));
  return Array.from(values, (v) => chars[v % chars.length]).join("");
}

export function ResetPasswordDialog({
  userId,
  email,
}: {
  userId: string;
  email: string;
}) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  const submit = () =>
    startTransition(async () => {
      const result = await resetUserPassword(userId, password);
      if (result.ok) {
        toast.success(result.message);
        setOpen(false);
        setPassword("");
      } else {
        toast.error(result.error);
      }
    });

  const copy = async () => {
    await navigator.clipboard.writeText(password);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <KeyRound /> Update password
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Update password</DialogTitle>
        <DialogDescription>
          Set a new password for{" "}
          <span className="font-medium text-foreground">{email}</span>. Share it
          with the user through a secure channel.
        </DialogDescription>

        <form
          className="mt-5 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor={`pw-${userId}`}>New password</Label>
            <div className="flex gap-2">
              <Input
                id={`pw-${userId}`}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                maxLength={72}
                autoComplete="new-password"
                placeholder="At least 8 characters"
                className="h-10 font-mono text-sm"
                required
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setPassword(generatePassword())}
                title="Generate a strong password"
                aria-label="Generate a strong password"
              >
                <RefreshCw />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={copy}
                disabled={!password}
                title="Copy"
                aria-label="Copy password"
              >
                {copied ? <Check /> : <Copy />}
              </Button>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending || password.length < 8}>
              {pending && <Loader2 className="animate-spin" />}
              Save password
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
