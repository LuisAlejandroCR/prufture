// layout.tsx: root layout for the public site; global tokens and base styles live in globals.css.
// Each route owns its shell: landing and /verify use <main class="wrap">, /dashboard its own layout.

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
