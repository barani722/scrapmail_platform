import { cookies } from "next/headers";
import type { ReactNode } from "react";

import { AppShell } from "@/components/app/app-shell";
import {
  SIDEBAR_COLLAPSED_COOKIE,
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  SIDEBAR_WIDTH_COOKIE,
} from "@/components/app/sidebar-config";
import { signOut } from "@/lib/auth/actions";
import { requireApprovedProfile } from "@/lib/auth/session";

/** Shell for all signed-in pages: approved accounts only. */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const profile = await requireApprovedProfile();
  const cookieStore = await cookies();

  // Sidebar state is stored in cookies so the first render matches the user's choice.
  const collapsed = cookieStore.get(SIDEBAR_COLLAPSED_COOKIE)?.value === "1";
  const savedWidth = Number(cookieStore.get(SIDEBAR_WIDTH_COOKIE)?.value);
  const width =
    Number.isFinite(savedWidth) &&
    savedWidth >= SIDEBAR_MIN_WIDTH &&
    savedWidth <= SIDEBAR_MAX_WIDTH
      ? savedWidth
      : SIDEBAR_DEFAULT_WIDTH;

  return (
    <AppShell
      displayName={profile.full_name || profile.email}
      isAdmin={profile.platform_role === "admin"}
      initialCollapsed={collapsed}
      initialWidth={width}
      signOut={signOut}
    >
      {children}
    </AppShell>
  );
}
