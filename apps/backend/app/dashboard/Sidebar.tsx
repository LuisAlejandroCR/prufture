// Sidebar.tsx: persistent dashboard navigation, grouped (Workspace / Insights / Admin) with icons;
// marks the current section with aria-current and, when staff sign-in is on, shows the signed-in
// account menu. At narrow widths globals.css turns this into a horizontal scroller.

"use client";

import { UserButton } from "@clerk/nextjs";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, Mark, type IconName } from "../_components/brand";

const GROUPS: { title: string; links: { href: string; label: string; icon: IconName }[] }[] = [
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

export function Sidebar({ staffAuth }: { staffAuth: boolean }) {
  const pathname = usePathname();

  return (
    <nav className="dash-side" aria-label="Dashboard sections">
      <Link href="/" className="dash-brand">
        <Mark />
      </Link>
      <div className="dash-groups">
        {GROUPS.map((g) => (
          <div className="dash-group" key={g.title}>
            <p className="dash-group-title">{g.title}</p>
            <div className="dash-nav">
              {g.links.map((l) => {
                const active = l.href === "/dashboard" ? pathname === l.href : pathname.startsWith(l.href);
                return (
                  <Link key={l.href} href={l.href} aria-current={active ? "page" : undefined}>
                    <Icon name={l.icon} />
                    <span>{l.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="dash-side-foot">
        <div className="dash-privacy">
          <span className="privacy-dot" aria-hidden />
          <span>
            <strong>Region level only</strong>
            <small>No names, faces or exact points.</small>
          </span>
        </div>
        {staffAuth ? (
          <div className="dash-account">
            <UserButton />
          </div>
        ) : null}
      </div>
    </nav>
  );
}
