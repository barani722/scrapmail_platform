"use client";

import { Lock, Mail, User } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { signUp } from "@/lib/auth/actions";

import { FormAlert } from "./form-alert";
import { IconInput, PasswordInput } from "./icon-input";

export function RegisterForm() {
  const [state, action, pending] = useActionState(signUp, undefined);

  if (state?.message) {
    return <FormAlert message={state.message} />;
  }

  return (
    <form action={action} className="space-y-5">
      <FormAlert error={state?.error} />

      <div className="space-y-2">
        <Label htmlFor="fullName">Full name</Label>
        <IconInput
          icon={User}
          id="fullName"
          name="fullName"
          autoComplete="name"
          placeholder="Enter your full name"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">Work email</Label>
        <IconInput
          icon={Mail}
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="Enter your work email"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <PasswordInput
          icon={Lock}
          id="password"
          name="password"
          autoComplete="new-password"
          placeholder="Enter your password"
          minLength={8}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirmPassword">Confirm password</Label>
        <PasswordInput
          icon={Lock}
          id="confirmPassword"
          name="confirmPassword"
          autoComplete="new-password"
          placeholder="Confirm your password"
          minLength={8}
          required
        />
      </div>

      <label className="flex items-center gap-3 text-base">
        <input
          type="checkbox"
          name="terms"
          required
          className="size-5 rounded accent-primary"
        />
        <span>
          I agree to the <span className="font-medium text-primary">Terms</span>{" "}
          and <span className="font-medium text-primary">Privacy Policy</span>
        </span>
      </label>

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? "Creating account…" : "Create account"}
      </Button>

      <p className="text-center text-base">
        Already have an account?{" "}
        <Link
          href="/login"
          className="font-semibold text-primary hover:underline"
        >
          Sign in
        </Link>
      </p>
    </form>
  );
}
