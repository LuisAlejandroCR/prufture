// page.tsx: /dashboard — aggregate read for UNICEF-side reviewers. Block 6 (stretch).
// Shows region-level geohash only, never exact GPS, never per-volunteer identity.

import { fetchProofs } from "../../lib/api";

export default async function DashboardPage() {
  const proofs = await fetchProofs();

  return (
    <section>
      <h1>Stakeholder dashboard</h1>
      <p style={{ color: "#555" }}>{proofs.length} proofs. Region-level only. No login, no PII.</p>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={th}>Task</th>
            <th style={th}>Region</th>
            <th style={th}>Captured</th>
            <th style={th}>Attestations</th>
          </tr>
        </thead>
        <tbody>
          {proofs.map((p) => (
            <tr key={p.proofHash}>
              <td style={td}>{p.taskId}</td>
              <td style={td}>{p.geohashRegion}</td>
              <td style={td}>{new Date(p.capturedAt).toISOString().slice(0, 10)}</td>
              <td style={td}>{p.attestationCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

const th = { textAlign: "left" as const, borderBottom: "2px solid #ddd", padding: "8px 4px" };
const td = { borderBottom: "1px solid #eee", padding: "8px 4px" };
