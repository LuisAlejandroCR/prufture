// layout.tsx: root layout for the public site.
// Global tokens and base styles live in globals.css. Each route owns its own shell:
// the landing and /verify use <main class="wrap"> (reading width); /dashboard uses the
// full-width operational shell in dashboard/layout.tsx.

import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "Prufture",
  description: "Check field reports without an account. No personal data.",
};

export const viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
