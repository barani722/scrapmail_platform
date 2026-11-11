import { CircleUserRound, LogOut } from "lucide-react";
import type { ReactNode } from "react";

import { SidebarNav } from "@/components/app/sidebar-nav";
import { Logo } from "@/components/brand/logo";
import { signOut } from "@/lib/auth/actions";
import { requireApprovedProfile } from "@/lib/auth/session";

/** Shell for all signed-in pages: approved accounts only. */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const profile = await requireApprovedProfile();
  const displayName = profile.full_name || profile.email;

  return (
    <div className="flex min-h-dvh">
      <aside className="hidden w-72 shrink-0 flex-col bg-sidebar px-5 py-8 md:flex">
        <Logo className="px-3" />
        <SidebarNav isAdmin={profile.platform_role === "admin"} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-20 items-center justify-between gap-4 border-b px-6 md:px-10">
          <div className="md:hidden">
            <Logo markOnly />
          </div>
          <div className="ml-auto flex items-center gap-4">
            <span className="flex items-center gap-2 text-base font-medium">
              <CircleUserRound
                aria-hidden="true"
                className="size-8 text-muted-foreground"
              />
              <span className="hidden sm:inline">{displayName}</span>
            </span>
            <form action={signOut}>
              <button
                type="submit"
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <LogOut aria-hidden="true" className="size-4" />
                Sign out
              </button>
            </form>
          </div>
        </header>
        <main className="flex-1 px-6 py-8 md:px-10">{children}</main>
      </div>
    </div>
  );
}
