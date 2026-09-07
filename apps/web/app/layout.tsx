// layout.tsx: root layout for the public verification site.

import type { ReactNode } from "react";

export const metadata = {
  title: "Proof-at-Capture",
  description: "Verify field-evidence proofs without login. Zero personal data.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0, background: "#fafafa", color: "#111" }}>
        <main style={{ maxWidth: 720, margin: "0 auto", padding: 24 }}>{children}</main>
      </body>
    </html>
  );
}
