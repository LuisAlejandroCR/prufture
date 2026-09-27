// map/page.tsx: /dashboard/map server component — fetches the coarse proof list, aggregates it into
// one cell per 5-char geohash region and hands the cells to the client map. No precise location
// exists on this route; zones are approximate (~2.4 km), never a reporter's position.

import { fetchProofs } from "../../../lib/api";
import { coverage } from "../../../lib/dashboard";
import { CoverageMap } from "../CoverageMap";

export const dynamic = "force-dynamic";

export default async function CoverageMapPage() {
  const { proofs, degraded } = await fetchProofs();
  const cells = coverage(proofs);
  const totalReports = cells.reduce((n, c) => n + c.count, 0);

  return (
    <section className="fade-in">
      <header>
        <h1>Coverage map</h1>
        <p className="muted">
          Where reports are coming from, by approximate zone. Exact locations of households,
          schools, or people are never recorded or shown.
        </p>
      </header>

      {degraded ? (
        <p className="pill wait" style={{ marginBottom: "var(--sp-4)" }}>
          The report index is unreachable right now. The map shows what was last available. This is
          a service degradation, not an empty programme.
        </p>
      ) : null}

      {cells.length === 0 ? (
        <p className="muted">No reports have been placed on the map yet.</p>
      ) : (
        <>
          <p className="muted">
            <strong style={{ color: "var(--text)" }}>{cells.length}</strong>{" "}
            {cells.length === 1 ? "zone" : "zones"} ·{" "}
            <strong style={{ color: "var(--text)" }}>{totalReports}</strong>{" "}
            {totalReports === 1 ? "report" : "reports"}
          </p>
          <CoverageMap cells={cells} />
          <div className="table-scroll" style={{ marginTop: "var(--sp-4)" }}>
            <table className="data">
              <thead>
                <tr>
                  <th>Approximate zone</th>
                  <th>Reports</th>
                  <th>Confirmed</th>
                </tr>
              </thead>
              <tbody>
                {cells.map((c) => (
                  <tr key={c.region}>
                    <td>
                      <code>{c.region}</code>
                    </td>
                    <td>{c.count}</td>
                    <td>{c.confirmed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
