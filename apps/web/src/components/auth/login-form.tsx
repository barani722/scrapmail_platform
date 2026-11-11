"use client";

import { Lock, Mail } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { signIn } from "@/lib/auth/actions";

import { FormAlert } from "./form-alert";
import { IconInput, PasswordInput } from "./icon-input";

export function LoginForm() {
  const [state, action, pending] = useActionState(signIn, undefined);

  return (
    <form action={action} className="space-y-6">
      <FormAlert error={state?.error} />

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <IconInput
          icon={Mail}
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="Enter your email"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <PasswordInput
          icon={Lock}
          id="password"
          name="password"
          autoComplete="current-password"
          placeholder="Enter your password"
          required
        />
      </div>

      <div className="flex items-center justify-between gap-4">
        <label className="flex items-center gap-3 text-base">
          <input
            type="checkbox"
            name="remember"
            defaultChecked
            className="size-5 rounded accent-primary"
          />
          Remember me
        </label>
        <Link
          href="/forgot-password"
          className="text-base font-medium text-primary hover:underline"
        >
          Forgot password?
        </Link>
      </div>

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>

      <p className="text-center text-base">
        Don&apos;t have an account?{" "}
        <Link
          href="/register"
          className="font-semibold text-primary hover:underline"
        >
          Create an account
        </Link>
      </p>
    </form>
  );
}
