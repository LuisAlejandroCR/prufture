// layout.tsx: root layout for the public verification site.
// Global tokens and base styles live in globals.css; this file only sets metadata and the shell.

import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "Prufture",
  description: "Verify field-evidence proofs without login. Zero personal data.",
};

export const viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="wrap">{children}</div>
      </body>
    </html>
  );
}
