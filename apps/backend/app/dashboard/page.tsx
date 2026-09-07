// page.tsx: /dashboard — aggregate read for UNICEF-side reviewers. Block 6 (stretch).
// Shows region-level geohash only, never exact GPS, never per-volunteer identity.
// Fetch is server-side; the client component only filters what is already coarse.

import Link from "next/link";
import { fetchProofs } from "../../lib/api";
import { DashboardTable } from "./DashboardTable";

export default async function DashboardPage() {
  const { proofs, degraded } = await fetchProofs();

  return (
    <section className="fade-in">
      <p style={{ marginBottom: "var(--sp-4)" }}>
        <Link href="/" className="faint" style={{ fontSize: "0.9rem", textDecoration: "none" }}>
          ← Prufture
        </Link>
      </p>
      <h1>Stakeholder dashboard</h1>
      <p className="muted">Region level only. No login, no personal data, no exact location.</p>
      {degraded ? (
        <p className="pill wait" style={{ marginTop: "var(--sp-4)" }}>
          The proof index is unreachable right now. Showing no rows: this is a service degradation,
          not an empty program.
        </p>
      ) : (
        <DashboardTable proofs={proofs} />
      )}
    </section>
  );
}
