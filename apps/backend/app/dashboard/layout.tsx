// layout.tsx: the desktop operational shell for /dashboard — persistent sidebar + full-width main,
// designed for 1280-1920 px; at smaller widths globals.css keeps it readable with a "desktop view" note.

import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";

export const metadata = {
  title: "Prufture dashboard",
  description: "Programme coverage and report review. Region level only, no personal data.",
};

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="dash">
      <Sidebar />
      <main className="dash-main">
        <p className="dash-narrow-note">
          This dashboard is built for a desktop screen. The full report table scrolls sideways on a
          small screen.
        </p>
        {children}
      </main>
    </div>
  );
}
