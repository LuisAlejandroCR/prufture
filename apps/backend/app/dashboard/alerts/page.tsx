// alerts/page.tsx: actionable problems only — what happened, why it matters, the next action, a
// rough time and a link into the pre-filtered view where the fix starts. No secrets, no raw webhook
// data, no stack traces.

import { fetchProofs } from "../../../lib/api";
import { alerts } from "../../../lib/dashboard";
import { AlertCard, EmptyState, PageHeader } from "../ui";

export const dynamic = "force-dynamic";

export default async function AlertsPage() {
  const { proofs, degraded } = await fetchProofs();
  const list = alerts(proofs, degraded);

  return (
    <section className="fade-in">
      <PageHeader eyebrow="Workspace" title="Alerts" lede="Problems that need a decision or a follow-up." />

      {list.length === 0 ? (
        <EmptyState icon="check" title="Nothing needs attention">
          No degraded services, no stale reports, no coverage gaps right now.
        </EmptyState>
      ) : (
        <div className="attn-list">
          {list.map((a) => (
            <AlertCard alert={a} showMeta key={a.id} />
          ))}
        </div>
      )}
    </section>
  );
}
