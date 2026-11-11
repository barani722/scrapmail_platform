"use client";

import {
  CircleUserRound,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  X,
} from "lucide-react";
import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

import {
  SIDEBAR_COLLAPSED_COOKIE,
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MAX_WIDTH as MAX_WIDTH,
  SIDEBAR_MIN_WIDTH as MIN_WIDTH,
  SIDEBAR_MINI_WIDTH as MINI_WIDTH,
  SIDEBAR_WIDTH_COOKIE,
} from "./sidebar-config";
import { SidebarNav } from "./sidebar-nav";

function saveCookie(name: string, value: string) {
  document.cookie = `${name}=${value}; path=/; max-age=31536000; samesite=lax`;
}

type AppShellProps = {
  children: ReactNode;
  displayName: string;
  isAdmin: boolean;
  initialCollapsed: boolean;
  initialWidth: number;
  signOut: () => Promise<void>;
};

export function AppShell({
  children,
  displayName,
  isAdmin,
  initialCollapsed,
  initialWidth,
  signOut,
}: AppShellProps) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [width, setWidth] = useState(initialWidth);
  const [resizing, setResizing] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const widthRef = useRef(width);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((value) => {
      saveCookie(SIDEBAR_COLLAPSED_COOKIE, value ? "0" : "1");
      return !value;
    });
  }, []);

  // Ctrl/Cmd + B toggles the sidebar.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "b") {
        event.preventDefault();
        toggleCollapsed();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleCollapsed]);

  // Drag the sidebar edge to resize it.
  const startResize = (event: ReactPointerEvent) => {
    event.preventDefault();
    setResizing(true);
    const onMove = (e: PointerEvent) => {
      const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, e.clientX));
      widthRef.current = next;
      setWidth(next);
    };
    const onUp = () => {
      setResizing(false);
      saveCookie(SIDEBAR_WIDTH_COOKIE, String(Math.round(widthRef.current)));
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const resetWidth = () => {
    widthRef.current = SIDEBAR_DEFAULT_WIDTH;
    setWidth(SIDEBAR_DEFAULT_WIDTH);
    saveCookie(SIDEBAR_WIDTH_COOKIE, String(SIDEBAR_DEFAULT_WIDTH));
  };

  const desktopWidth = collapsed ? MINI_WIDTH : width;

  return (
    <div
      className={cn(
        "flex min-h-dvh",
        resizing && "cursor-col-resize select-none",
      )}
      style={{ "--sidebar-width": `${desktopWidth}px` } as CSSProperties}
    >
      {/* Mobile overlay */}
      <div
        aria-hidden="true"
        onClick={() => setMobileOpen(false)}
        className={cn(
          "fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px] transition-opacity duration-300 md:hidden",
          mobileOpen ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-sidebar-border bg-sidebar py-6 transition-transform duration-300 ease-out",
          "md:sticky md:top-0 md:z-auto md:h-dvh md:w-(--sidebar-width) md:translate-x-0 md:transition-[width]",
          resizing && "md:transition-none",
          collapsed ? "md:items-center md:px-2" : "px-4",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div
          className={cn(
            "flex items-center justify-between",
            collapsed ? "md:justify-center" : "px-2",
          )}
        >
          <Logo markOnly={collapsed} className="hidden md:inline-flex" />
          <Logo className="md:hidden" />
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="rounded-lg p-2 text-muted-foreground hover:bg-background/60 md:hidden"
            aria-label="Close menu"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="md:hidden">
          <SidebarNav
            isAdmin={isAdmin}
            collapsed={false}
            onNavigate={() => setMobileOpen(false)}
          />
        </div>
        <div className="hidden flex-1 md:flex md:flex-col">
          <SidebarNav isAdmin={isAdmin} collapsed={collapsed} />
        </div>

        {!collapsed && (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize sidebar (double-click to reset)"
            onPointerDown={startResize}
            onDoubleClick={resetWidth}
            className="absolute inset-y-0 -right-1 hidden w-2 cursor-col-resize md:block"
          >
            <span
              className={cn(
                "mx-auto block h-full w-0.5 transition-colors duration-200 hover:bg-primary/50",
                resizing && "bg-primary",
              )}
            />
          </div>
        )}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur md:px-8">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:hidden"
            aria-label="Open menu"
          >
            <Menu className="size-5" />
          </button>
          <button
            type="button"
            onClick={toggleCollapsed}
            className="hidden rounded-lg p-2 text-muted-foreground transition-all hover:bg-muted hover:text-foreground active:scale-90 md:inline-flex"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={`${collapsed ? "Expand" : "Collapse"} sidebar (Ctrl+B)`}
          >
            {collapsed ? (
              <PanelLeftOpen className="size-5" />
            ) : (
              <PanelLeftClose className="size-5" />
            )}
          </button>

          <div className="ml-auto flex items-center gap-2 sm:gap-4">
            <ThemeToggle />
            <span className="flex items-center gap-2 text-sm font-medium">
              <CircleUserRound
                aria-hidden="true"
                className="size-7 text-muted-foreground"
              />
              <span className="hidden max-w-48 truncate sm:inline">
                {displayName}
              </span>
            </span>
            <form action={signOut}>
              <button
                type="submit"
                className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-muted-foreground transition-all hover:bg-muted hover:text-foreground active:scale-95"
                title="Sign out"
              >
                <LogOut aria-hidden="true" className="size-4" />
                <span className="hidden sm:inline">Sign out</span>
              </button>
            </form>
          </div>
        </header>
        <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
