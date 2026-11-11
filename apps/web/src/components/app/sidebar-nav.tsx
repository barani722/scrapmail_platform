"use client";

import {
  Building2,
  FileText,
  House,
  Layers,
  Mail,
  ShieldCheck,
  Users,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  soon?: boolean;
};

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: House },
  { href: "/agencies", label: "Agencies", icon: Building2 },
  { href: "/scraping-jobs", label: "Scraping Jobs", icon: Layers },
  { href: "/contacts", label: "Contacts", icon: Users },
  { href: "#", label: "Email Campaigns", icon: Mail, soon: true },
  { href: "#", label: "Templates", icon: FileText, soon: true },
];

const ADMIN_NAV: NavItem[] = [
  { href: "/admin/users", label: "User management", icon: ShieldCheck },
];

export function SidebarNav({
  isAdmin,
  collapsed,
  onNavigate,
}: {
  isAdmin: boolean;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  const renderItem = (item: NavItem) => {
    const Icon = item.icon;
    const active =
      !item.soon &&
      (pathname === item.href || pathname.startsWith(`${item.href}/`));
    const base = cn(
      "group relative flex items-center rounded-lg text-[15px] transition-all duration-200",
      collapsed ? "size-11 justify-center" : "gap-3 px-3.5 py-2.5",
    );

    if (item.soon) {
      return (
        <li key={item.label}>
          <span
            aria-disabled="true"
            title={collapsed ? `${item.label} (coming soon)` : undefined}
            className={cn(base, "cursor-not-allowed text-muted-foreground/60")}
          >
            <Icon className="size-5 shrink-0" />
            {!collapsed && (
              <>
                <span className="truncate">{item.label}</span>
                <span className="ml-auto rounded-full bg-background/70 px-2 py-0.5 text-[11px]">
                  Soon
                </span>
              </>
            )}
          </span>
        </li>
      );
    }

    return (
      <li key={item.label}>
        <Link
          href={item.href}
          onClick={onNavigate}
          aria-current={active ? "page" : undefined}
          title={collapsed ? item.label : undefined}
          className={cn(
            base,
            active
              ? "bg-sidebar-accent font-semibold text-sidebar-accent-foreground shadow-sm"
              : "text-sidebar-foreground hover:translate-x-0.5 hover:bg-background/60",
          )}
        >
          <Icon
            className={cn(
              "size-5 shrink-0 transition-transform duration-200",
              !active && "group-hover:scale-110",
            )}
          />
          {!collapsed && <span className="truncate">{item.label}</span>}
        </Link>
      </li>
    );
  };

  return (
    <nav className="mt-8 flex flex-1 flex-col gap-6" aria-label="Main">
      <ul
        className={cn("space-y-1", collapsed && "flex flex-col items-center")}
      >
        {NAV.map(renderItem)}
      </ul>
      {isAdmin && (
        <div className="border-t border-sidebar-border pt-5">
          {!collapsed && (
            <p className="mb-2 px-3.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Administration
            </p>
          )}
          <ul
            className={cn(
              "space-y-1",
              collapsed && "flex flex-col items-center",
            )}
          >
            {ADMIN_NAV.map(renderItem)}
          </ul>
        </div>
      )}
    </nav>
  );
}
