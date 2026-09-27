// reports/page.tsx: the full-width report workspace — same coarse data and filters as Overview.
// Region level only, no personal data.

import { fetchProofs } from "../../../lib/api";
import { DashboardTable } from "../DashboardTable";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const { proofs, degraded } = await fetchProofs();

  return (
    <section className="fade-in">
      <header>
        <h1>Reports</h1>
        <p className="muted">
          Every report received, filterable by programme, status, and date. No login, no personal
          data.
        </p>
      </header>

      {degraded ? (
        <p className="pill wait" style={{ marginBottom: "var(--sp-4)" }}>
          The report index is unreachable right now. The table shows what was last available.
        </p>
      ) : null}

      <DashboardTable proofs={proofs} />
    </section>
  );
}
