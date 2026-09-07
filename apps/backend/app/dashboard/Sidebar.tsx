// Sidebar.tsx: persistent dashboard navigation. Marks the current section with
// aria-current. At narrow widths globals.css turns this into a horizontal scroller.

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS: { href: string; label: string }[] = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/reports", label: "Reports" },
  { href: "/dashboard/programmes", label: "Programmes" },
  { href: "/dashboard/communities", label: "Communities" },
  { href: "/dashboard/alerts", label: "Alerts" },
  { href: "/dashboard/exports", label: "Exports" },
  { href: "/dashboard/settings", label: "Settings" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <nav className="dash-side" aria-label="Dashboard sections">
      <Link href="/" className="dash-brand" style={{ textDecoration: "none", color: "inherit" }}>
        Prufture
      </Link>
      <div className="dash-nav">
        {LINKS.map((l) => {
          const active = l.href === "/dashboard" ? pathname === l.href : pathname.startsWith(l.href);
          return (
            <Link key={l.href} href={l.href} aria-current={active ? "page" : undefined}>
              {l.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
