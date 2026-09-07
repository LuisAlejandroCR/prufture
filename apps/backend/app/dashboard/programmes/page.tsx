// programmes/page.tsx: coverage by activity type, not by person. Reports received,
// confirmed, needing attention, areas touched, and last activity. Region level only.

import { fetchProofs } from "../../../lib/api";
import { activityLabel, programmes } from "../../../lib/dashboard";

export const dynamic = "force-dynamic";

function day(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "not recorded" : d.toISOString().slice(0, 10);
}

export default async function ProgrammesPage() {
  const { proofs, degraded } = await fetchProofs();
  const rows = programmes(proofs);

  return (
    <section className="fade-in">
      <header>
        <h1>Programmes</h1>
        <p className="muted">Coverage by activity type. No individual identities.</p>
      </header>

      {degraded ? (
        <p className="pill wait">The report index is unreachable right now.</p>
      ) : rows.length === 0 ? (
        <p className="muted">No reports have been received yet.</p>
      ) : (
        <div className="table-scroll">
          <table className="data">
            <thead>
              <tr>
                <th>Activity type</th>
                <th>Reports received</th>
                <th>Reports confirmed</th>
                <th>Needing attention</th>
                <th>Areas</th>
                <th>Last activity</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.taskId}>
                  <td>{activityLabel(r.taskId)}</td>
                  <td>{r.received}</td>
                  <td>{r.confirmed}</td>
                  <td>{r.attention}</td>
                  <td>{r.areas}</td>
                  <td>{day(r.lastActivity)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
