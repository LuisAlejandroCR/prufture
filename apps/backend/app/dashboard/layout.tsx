// layout.tsx: the desktop operational shell for /dashboard and its sub-routes.
// Persistent left sidebar + full-width main. Designed for 1280-1920 px; at smaller
// widths globals.css keeps everything readable and shows a "desktop view" note.

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
