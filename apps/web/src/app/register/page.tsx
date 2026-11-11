import type { Metadata } from "next";

import { AuthShell, SecureNote } from "@/components/auth/auth-shell";
import { RegisterForm } from "@/components/auth/register-form";

export const metadata: Metadata = { title: "Create account" };

export default function RegisterPage() {
  return (
    <AuthShell
      headline="Build and reach your agency database"
      description="Discover relevant agencies, extract their contact information, and run personalized email outreach — all in one place."
    >
      <h2 className="text-3xl font-bold tracking-tight">
        Create your Scrap&amp;Mail account
      </h2>
      <p className="mt-2 mb-8 text-lg text-muted-foreground">
        Start building your agency database. New accounts are reviewed by an
        administrator before access is granted.
      </p>
      <RegisterForm />
      <SecureNote title="Secure account creation" />
    </AuthShell>
  );
}
