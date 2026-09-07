// page.tsx: /dashboard — aggregate read for UNICEF-side reviewers. Block 6 (stretch).
// Shows region-level geohash only, never exact GPS, never per-volunteer identity.
// Fetch is server-side; the client component only filters what is already coarse.

import { fetchProofs } from "../../lib/api";
import { DashboardTable } from "./DashboardTable";

export default async function DashboardPage() {
  const { proofs, degraded } = await fetchProofs();

  return (
    <section>
      <h1>Stakeholder dashboard</h1>
      <p style={{ color: "#555" }}>Region-level only. No login, no PII.</p>
      {degraded ? (
        <p style={{ color: "#8a6d00" }}>
          The proof index is unreachable right now. Showing no rows — this is a service degradation,
          not an empty program.
        </p>
      ) : (
        <DashboardTable proofs={proofs} />
      )}
    </section>
  );
}
