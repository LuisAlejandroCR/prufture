// brand.tsx: the shared Prufture mark, stroke icon set and public-site chrome (header + footer),
// so /verify, /privacy, /support, sign-in and the dashboard carry the same identity as the landing.
// Server-safe and Clerk-free: /verify imports this and must never pull in auth code.

import Link from "next/link";
import type { ReactNode } from "react";

export function Mark({ label = true }: { label?: boolean }) {
  return (
    <span className="landing-mark brand-mark" aria-label="Prufture">
      <img className="brand-app-icon" src="/media/prufture-icon.png" alt="" aria-hidden="true" />
      {label ? <span>Prufture</span> : null}
    </span>
  );
}

const PATHS = {
  overview: "M4 13h6V4H4zM14 20h6v-9h-6zM4 20h6v-3H4zM14 7h6V4h-6z",
  reports: "M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6",
  programmes: "M4 7h16M4 12h16M4 17h10",
  communities: "M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 20a6 6 0 0 1 12 0M17 11a2.5 2.5 0 1 0 0-5M21 20a5 5 0 0 0-4-4.9",
  map: "M9 4 3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14",
  alert: "M12 4 2.5 20h19zM12 10v4M12 17.5v.01",
  export: "M12 4v11M7 10l5 5 5-5M5 20h14",
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3.9a7 7 0 0 0-2-1.2L14.2 3h-4l-.4 2.6a7 7 0 0 0-2 1.2l-2.4-.9-2 3.4 2 1.5a7 7 0 0 0 0 2.4l-2 1.5 2 3.4 2.4-.9a7 7 0 0 0 2 1.2l.4 2.6h4l.4-2.6a7 7 0 0 0 2-1.2l2.3.9 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z",
  check: "m5 12 5 5 9-10",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2",
  inbox: "M3 13h5l1 3h6l1-3h5M5 5h14l2 8v6H3v-6z",
  users: "M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2 20a6 6 0 0 1 12 0M16 4.5a3 3 0 0 1 0 6M22 20a6 6 0 0 0-4-5.6",
  layers: "m12 3 9 5-9 5-9-5zM3 13l9 5 9-5",
  pin: "M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  shield: "M12 3 4 6v6c0 4.5 3.4 8.2 8 9 4.6-.8 8-4.5 8-9V6zM8.5 12l2.5 2.5 4.5-5",
  arrow: "M5 12h14M13 6l6 6-6 6",
  back: "M19 12H5M11 6l-6 6 6 6",
  external: "M14 4h6v6M20 4l-9 9M18 14v6H4V6h6",
  lock: "M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4",
  eyeOff: "M3 3l18 18M10.6 5.1A9.8 9.8 0 0 1 12 5c5 0 9 4.5 10 7a13 13 0 0 1-3 4.2M6.1 6.1C3.9 7.6 2.5 9.8 2 12c1 2.5 5 7 10 7 1.8 0 3.4-.5 4.8-1.3M9.9 9.9a3 3 0 0 0 4.2 4.2",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  signal: "M5 15.5a10 10 0 0 1 14 0M8.5 19a5 5 0 0 1 7 0M2 12a15 15 0 0 1 20 0",
  file: "M6 3h9l4 4v14H6zM9 12h7M9 16h7",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4",
  help: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5v.7M12 17v.01",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg
      className="ic"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

/** Slim top bar for the public pages, echoing the landing navigation. */
export function SiteHeader({ action }: { action?: ReactNode }) {
  return (
    <header className="site-head">
      <Link className="brand-link" href="/">
        <Mark />
      </Link>
      <nav className="site-head-links" aria-label="Primary navigation">
        <Link href="/#how">How it works</Link>
        <Link href="/privacy">Privacy</Link>
        <Link href="/support">Support</Link>
      </nav>
      {action ?? (
        <Link className="site-head-action" href="/dashboard">
          Dashboard
        </Link>
      )}
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-foot">
      <Mark />
      <p>Field evidence, verified in public. No personal data, ever.</p>
      <nav aria-label="Footer">
        <Link href="/privacy">Privacy</Link>
        <Link href="/support">Support</Link>
        <Link href="/">Home</Link>
      </nav>
    </footer>
  );
}
