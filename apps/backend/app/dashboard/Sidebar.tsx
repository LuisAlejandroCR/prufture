// Sidebar.tsx: persistent dashboard navigation; marks the current section with aria-current and,
// when staff sign-in is on, shows the signed-in account menu. At narrow widths globals.css turns
// this into a horizontal scroller.

"use client";

import { UserButton } from "@clerk/nextjs";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS: { href: string; label: string }[] = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/reports", label: "Reports" },
  { href: "/dashboard/programmes", label: "Programmes" },
  { href: "/dashboard/communities", label: "Communities" },
  { href: "/dashboard/map", label: "Coverage" },
  { href: "/dashboard/alerts", label: "Alerts" },
  { href: "/dashboard/exports", label: "Exports" },
  { href: "/dashboard/settings", label: "Settings" },
];

export function Sidebar({ staffAuth }: { staffAuth: boolean }) {
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
      {staffAuth ? (
        <div className="dash-account">
          <UserButton />
        </div>
      ) : null}
    </nav>
  );
}
