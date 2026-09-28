// alerts/page.tsx: actionable problems only — what happened, why it matters, the next action and a
// rough time. No secrets, no raw webhook data, no stack traces.

import { fetchProofs } from "../../../lib/api";
import { alerts } from "../../../lib/dashboard";

export const dynamic = "force-dynamic";

export default async function AlertsPage() {
  const { proofs, degraded } = await fetchProofs();
  const list = alerts(proofs, degraded);

  return (
    <section className="fade-in">
      <header>
        <h1>Alerts</h1>
        <p className="muted">Problems that need a decision or a follow-up.</p>
      </header>

      {list.length === 0 ? (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Nothing needs attention</h3>
          <p className="muted" style={{ marginBottom: 0 }}>
            No degraded services, no stale reports, no coverage gaps right now.
          </p>
        </div>
      ) : (
        <div className="attn-list">
          {list.map((a) => (
            <div className={`attn-item ${a.severity === "high" ? "high" : ""}`} key={a.id}>
              <h3>{a.what}</h3>
              <p>{a.why}</p>
              <p style={{ color: "var(--text)" }}>
                <strong>Recommended:</strong> {a.action}
              </p>
              <p className="faint" style={{ fontSize: "0.85rem", marginBottom: 0 }}>
                {a.severity === "high" ? "High priority" : "Normal"} · {a.when}
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
