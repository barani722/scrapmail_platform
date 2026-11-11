import { Clock, ShieldX } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth/actions";
import { getCurrentProfile } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Account status" };

const COPY = {
  pending: {
    title: "Your account is awaiting approval",
    text: "An administrator will review your registration. You will get access as soon as it is approved.",
  },
  rejected: {
    title: "Your registration was not approved",
    text: "Please contact an administrator if you believe this is a mistake.",
  },
  suspended: {
    title: "Your account is suspended",
    text: "Access to Scrap&Mail is currently disabled for this account. Please contact an administrator.",
  },
} as const;

export default async function PendingPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.status === "approved") redirect("/dashboard");

  const copy = COPY[profile.status];
  const Icon = profile.status === "pending" ? Clock : ShieldX;

  return (
    <AuthShell
      headline="Agency discovery and email outreach platform"
      description="Find relevant agencies, extract their contact information, and reach out with personalized emails — all in one place."
    >
      <Icon aria-hidden="true" className="size-10 text-primary" />
      <h2 className="mt-6 text-3xl font-bold tracking-tight">{copy.title}</h2>
      <p className="mt-3 text-lg text-muted-foreground">{copy.text}</p>
      <p className="mt-6 text-sm text-muted-foreground">
        Signed in as <span className="font-medium">{profile.email}</span>
      </p>
      <form action={signOut} className="mt-8">
        <Button type="submit" variant="outline" size="lg" className="w-full">
          Sign out
        </Button>
      </form>
    </AuthShell>
  );
}
