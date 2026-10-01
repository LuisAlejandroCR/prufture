// Sidebar.tsx: persistent dashboard navigation, grouped (Workspace / Insights / Admin) with icons;
// marks the current section with aria-current and, when staff sign-in is on, shows the signed-in
// account menu. At narrow widths it keeps the three daily destinations visible and moves the
// lower-frequency destinations into an accessible More menu.

"use client";

import { UserButton } from "@clerk/nextjs";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, type KeyboardEvent } from "react";
import { Icon, Mark } from "../_components/brand";
import { MORE_LINKS, NAV_GROUPS, isActiveSection } from "../../lib/dashboard-nav";

export function Sidebar({ staffAuth }: { staffAuth: boolean }) {
  const pathname = usePathname();
  const more = useRef<HTMLDetailsElement>(null);
  const isActive = (href: string) => isActiveSection(pathname, href);
  const moreActive = MORE_LINKS.some((link) => isActive(link.href));

  // A <details> menu stays open across client-side navigation; close it once the route changes.
  useEffect(() => {
    if (more.current) more.current.open = false;
  }, [pathname]);

  // Escape closes the menu and returns focus to its toggle; a press anywhere outside closes it.
  useEffect(() => {
    const onPointer = (event: PointerEvent) => {
      const menu = more.current;
      if (menu?.open && !menu.contains(event.target as Node)) menu.open = false;
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, []);
  const onMoreKey = (event: KeyboardEvent<HTMLDetailsElement>) => {
    const menu = more.current;
    if (event.key !== "Escape" || !menu?.open) return;
    menu.open = false;
    menu.querySelector("summary")?.focus();
  };

  return (
    <nav className="dash-side" aria-label="Dashboard sections">
      <Link href="/" className="dash-brand">
        <Mark />
      </Link>
      <div className="dash-groups">
        {NAV_GROUPS.map((g) => (
          <div className="dash-group" key={g.title}>
            <p className="dash-group-title">{g.title}</p>
            <div className="dash-nav">
              {g.links.map((l) => {
                const active = isActive(l.href);
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
      <details className="dash-more" ref={more} onKeyDown={onMoreKey}>
        <summary aria-label="More dashboard sections" aria-current={moreActive ? "page" : undefined}>
          <Icon name="more" />
          <span>More</span>
        </summary>
        <div className="dash-more-menu">
          {MORE_LINKS.map((link) => (
            <Link key={link.href} href={link.href} aria-current={isActive(link.href) ? "page" : undefined}>
              <Icon name={link.icon} />
              <span>{link.label}</span>
            </Link>
          ))}
        </div>
      </details>
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
