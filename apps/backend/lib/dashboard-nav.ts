// dashboard-nav.ts: the dashboard's section list and the rule for which section is current.
// Pure data + one function so the sidebar and its narrow-screen More menu stay testable
// without rendering React.

import type { IconName } from "../app/_components/brand";

export type NavLink = { href: string; label: string; icon: IconName };
export type NavGroup = { title: string; links: NavLink[] };

export const NAV_GROUPS: NavGroup[] = [
  {
    title: "Workspace",
    links: [
      { href: "/dashboard", label: "Overview", icon: "overview" },
      { href: "/dashboard/reports", label: "Reports", icon: "reports" },
      { href: "/dashboard/alerts", label: "Alerts", icon: "alert" },
    ],
  },
  {
    title: "Insights",
    links: [
      { href: "/dashboard/programmes", label: "Programmes", icon: "layers" },
      { href: "/dashboard/communities", label: "Communities", icon: "communities" },
      { href: "/dashboard/map", label: "Coverage", icon: "map" },
    ],
  },
  {
    title: "Admin",
    links: [
      { href: "/dashboard/exports", label: "Exports", icon: "export" },
      { href: "/dashboard/settings", label: "Settings", icon: "settings" },
    ],
  },
];

// At narrow widths only the Workspace group stays in the bar; everything else lives under More.
export const MORE_LINKS: NavLink[] = NAV_GROUPS.slice(1).flatMap((group) => group.links);

// Overview matches only itself; any other section also owns its sub-pages (/dashboard/reports/<hash>).
export function isActiveSection(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}
