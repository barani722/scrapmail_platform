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
  adminOnly?: boolean;
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
  { href: "/admin/users", label: "User approvals", icon: ShieldCheck },
];

export function SidebarNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();

  const renderItem = (item: NavItem) => {
    const active =
      !item.soon &&
      (pathname === item.href || pathname.startsWith(`${item.href}/`));
    const Icon = item.icon;

    if (item.soon) {
      return (
        <li key={item.label}>
          <span
            aria-disabled="true"
            className="flex cursor-not-allowed items-center gap-3 rounded-lg px-4 py-3 text-base text-muted-foreground/70"
          >
            <Icon className="size-5" />
            {item.label}
            <span className="ml-auto rounded-full bg-white/70 px-2 py-0.5 text-xs">
              Soon
            </span>
          </span>
        </li>
      );
    }

    return (
      <li key={item.label}>
        <Link
          href={item.href}
          aria-current={active ? "page" : undefined}
          className={cn(
            "flex items-center gap-3 rounded-lg px-4 py-3 text-base transition-colors",
            active
              ? "bg-sidebar-accent font-semibold text-sidebar-accent-foreground"
              : "text-sidebar-foreground hover:bg-white/60",
          )}
        >
          <Icon className="size-5" />
          {item.label}
        </Link>
      </li>
    );
  };

  return (
    <nav className="mt-10 space-y-6" aria-label="Main">
      <ul className="space-y-1">{NAV.map(renderItem)}</ul>
      {isAdmin && (
        <div className="border-t border-slate-300/60 pt-6">
          <p className="mb-2 px-4 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Administration
          </p>
          <ul className="space-y-1">{ADMIN_NAV.map(renderItem)}</ul>
        </div>
      )}
    </nav>
  );
}
