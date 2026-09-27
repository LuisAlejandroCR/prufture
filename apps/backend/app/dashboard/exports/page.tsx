// exports/page.tsx: programme review exports — only supported behaviour is offered, explained before
// download. Exports exclude PII, exact coordinates, private media links, secrets and internal
// thresholds; the one real export is the coarse aggregate the dashboard already shows.

import { ExportButton } from "./ExportButton";
import { fetchProofs } from "../../../lib/api";

export const dynamic = "force-dynamic";

export default async function ExportsPage() {
  const { proofs, degraded } = await fetchProofs();

  return (
    <section className="fade-in">
      <header>
        <h1>Exports</h1>
        <p className="muted">Download the coarse aggregate for offline programme review.</p>
      </header>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Coarse report list (CSV)</h3>
        <p className="muted">
          One row per report: activity, programme, approximate region, capture date, review status,
          and confirmation count.
        </p>
        <p className="faint" style={{ fontSize: "0.9rem" }}>
          Excluded: reporter identity, exact location, full reference, photos, and any internal
          scoring.
        </p>
        {degraded ? (
          <p className="pill wait">The report index is unreachable, so there is nothing to export.</p>
        ) : (
          <ExportButton proofs={proofs} />
        )}
      </div>

      <div className="card" style={{ marginTop: "var(--sp-4)" }}>
        <h3 style={{ marginTop: 0 }}>Signed evidence bundle</h3>
        <p className="muted">A per-report evidence package is a planned feature.</p>
        <button type="button" className="btn secondary" disabled>
          Not available in this demo
        </button>
      </div>
    </section>
  );
}
