// layout.tsx: the desktop operational shell for /dashboard — persistent sidebar + full-width main,
// designed for 1280-1920 px. Staff-only behind Clerk when keys are set (middleware.ts); without keys
// it stays open and says so. ClerkProvider lives here, never in the root layout, so /verify has no Clerk.

import { ClerkProvider } from "@clerk/nextjs";
import type { ReactNode } from "react";
import { isStaffAuthConfigured } from "../../lib/staff-auth";
import { Sidebar } from "./Sidebar";

export const metadata = {
  title: "Prufture dashboard",
  description: "Programme coverage and report review. Region level only, no personal data.",
};

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const staffAuth = isStaffAuthConfigured();
  const shell = (
    <div className="dash">
      <Sidebar staffAuth={staffAuth} />
      <main className="dash-main">
        {staffAuth ? null : (
          <p className="dash-auth-banner" role="status">
            Staff sign-in is not configured on this deployment, so this dashboard is open to anyone
            with the link. It shows region-level data only, never personal data.
          </p>
        )}
        <p className="dash-narrow-note">
          This dashboard is built for a desktop screen. The full report table scrolls sideways on a
          small screen.
        </p>
        {children}
      </main>
    </div>
  );
  return staffAuth ? <ClerkProvider>{shell}</ClerkProvider> : shell;
}
