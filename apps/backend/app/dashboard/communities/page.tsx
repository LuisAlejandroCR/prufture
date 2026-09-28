// communities/page.tsx: geographic coverage by coarse region, with aggregate counts and the regions
// that still need a second community report. Never a household, school or beneficiary coordinate.

import { fetchProofs } from "../../../lib/api";
import { areas } from "../../../lib/dashboard";

export const dynamic = "force-dynamic";

export default async function CommunitiesPage() {
  const { proofs, degraded } = await fetchProofs();
  const rows = areas(proofs);
  const gaps = rows.filter((r) => r.needsAnother > 0);

  return (
    <section className="fade-in">
      <header>
        <h1>Communities and areas</h1>
        <p className="muted">
          Coverage by approximate region. Exact locations of households, schools, or people are
          never shown.
        </p>
      </header>

      {degraded ? (
        <p className="pill wait">The report index is unreachable right now.</p>
      ) : rows.length === 0 ? (
        <p className="muted">No regions have reported yet.</p>
      ) : (
        <>
          {gaps.length > 0 ? (
            <p className="pill wait" style={{ marginBottom: "var(--sp-4)" }}>
              {gaps.length} {gaps.length === 1 ? "region needs" : "regions need"} a second community
              report
            </p>
          ) : null}
          <div className="table-scroll">
            <table className="data">
              <thead>
                <tr>
                  <th>Approximate region</th>
                  <th>Reports</th>
                  <th>Confirmed</th>
                  <th>Needs another report</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.region}>
                    <td>
                      <code>{r.region}</code>
                    </td>
                    <td>{r.received}</td>
                    <td>{r.confirmed}</td>
                    <td>{r.needsAnother}</td>
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
