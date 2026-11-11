import type { Metadata } from "next";

import { AuthShell, SecureNote } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
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
      <LoginForm />
      <SecureNote title="Secure sign-in" />
    </AuthShell>
  );
}
