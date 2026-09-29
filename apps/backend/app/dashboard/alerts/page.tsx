// alerts/page.tsx: actionable problems only — what happened, why it matters, the next action and a
// rough time. No secrets, no raw webhook data, no stack traces.

import { fetchProofs } from "../../../lib/api";
import { alerts } from "../../../lib/dashboard";
import { Icon } from "../../_components/brand";
import { EmptyState, PageHeader } from "../ui";

export const dynamic = "force-dynamic";

export default async function AlertsPage() {
  const { proofs, degraded } = await fetchProofs();
  const list = alerts(proofs, degraded);

  return (
    <section className="fade-in">
      <PageHeader
        eyebrow="Workspace"
        title="Alerts"
        lede="Problems that need a decision or a follow-up."
      />

      {list.length === 0 ? (
        <EmptyState icon="check" title="Nothing needs attention">
          No degraded services, no stale reports, no coverage gaps right now.
        </EmptyState>
      ) : (
        <div className="attn-list">
          {list.map((a) => (
            <div className={`attn-item ${a.severity === "high" ? "high" : ""}`} key={a.id}>
              <span className="attn-icon">
                <Icon name={a.severity === "high" ? "alert" : a.id === "needs-second" ? "users" : "clock"} />
              </span>
              <div>
                <div className="attn-top">
                  <h3>{a.what}</h3>
                  <span className={`pill ${a.severity === "high" ? "attn" : "neutral"}`}>
                    {a.severity === "high" ? "High priority" : "Normal"} · {a.when}
                  </span>
                </div>
                <p>{a.why}</p>
                <p className="attn-next">
                  <strong>Recommended:</strong> {a.action}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
