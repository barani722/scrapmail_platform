import type { Metadata } from "next";

import { AuthShell, SecureNote } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = { title: "Sign in" };

/** Messages after following an email confirmation link (see /auth/callback). */
const NOTICES = {
  confirmed: {
    message: "Your email address is confirmed. Sign in to continue.",
  },
  link_invalid: {
    error:
      "This confirmation link has expired or was already used. Try signing in; if your email is still not confirmed, ask an administrator to approve your account.",
  },
} as const;

type Props = { searchParams: Promise<{ notice?: string }> };

export default async function LoginPage({ searchParams }: Props) {
  const { notice } = await searchParams;
  const initial =
    notice && notice in NOTICES
      ? NOTICES[notice as keyof typeof NOTICES]
      : undefined;

  return (
    <AuthShell
      headline="Agency discovery and email outreach platform"
      description="Find relevant agencies, extract their contact information, and reach out with personalized emails — all in one place."
    >
      <h2 className="text-3xl font-bold tracking-tight">
        Welcome back to Scrap&amp;Mail
      </h2>
      <p className="mt-2 mb-8 text-lg text-muted-foreground">
        Sign in to your account to continue.
      </p>
      <LoginForm initial={initial} />
      <SecureNote title="Secure sign-in" />
    </AuthShell>
  );
}
