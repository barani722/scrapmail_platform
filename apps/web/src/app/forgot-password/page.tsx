import type { Metadata } from "next";
import Link from "next/link";

import { AuthShell } from "@/components/auth/auth-shell";

export const metadata: Metadata = { title: "Forgot password" };

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      headline="Agency discovery and email outreach platform"
      description="Find relevant agencies, extract their contact information, and reach out with personalized emails — all in one place."
    >
      <h2 className="text-3xl font-bold tracking-tight">Forgot password?</h2>
      <p className="mt-4 text-lg text-muted-foreground">
        Password reset by email is not enabled yet. Please contact your
        administrator to reset your password.
      </p>
      <Link
        href="/login"
        className="mt-8 inline-block font-semibold text-primary hover:underline"
      >
        Back to sign in
      </Link>
    </AuthShell>
  );
}
