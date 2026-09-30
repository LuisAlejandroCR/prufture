// layout.tsx: root layout for the public site; global tokens and base styles live in globals.css.
// Each route owns its shell: landing and /verify use <main class="wrap">, /dashboard its own layout.

import type { ReactNode } from "react";
import "./globals.css";

// Absolute base for link previews (app/opengraph-image.png); override per deploy with NEXT_PUBLIC_SITE_URL.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") || "https://prufture.voltarut.com";

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Prufture",
  description: "Check field reports without an account. No personal data.",
  openGraph: {
    type: "website",
    siteName: "Prufture",
    title: "Prufture",
    description: "Offline field reporting that protects the people doing the work.",
  },
  twitter: { card: "summary_large_image" },
};

export const viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
