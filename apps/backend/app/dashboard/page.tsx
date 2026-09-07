// page.tsx: /dashboard Overview. Summary metrics, an attention list, and the recent
// report workspace. Region level only: no login, no personal data, no exact location.
// Fetch is server-side; the client table filters what is already coarse.

import Link from "next/link";
import { fetchProofs } from "../../lib/api";
import { alerts, metrics } from "../../lib/dashboard";
import { DashboardTable } from "./DashboardTable";

export const dynamic = "force-dynamic";

export default async function DashboardOverview() {
  const { proofs, degraded } = await fetchProofs();
  const m = metrics(proofs);
  const attention = alerts(proofs, degraded).slice(0, 2);

  const cards: { n: number; k: string }[] = [
    { n: m.thisWeek, k: "Reports this week" },
    { n: m.readyToReview, k: "Ready to review" },
    { n: m.needAnother, k: "Need another report" },
    { n: m.confirmed, k: "Confirmed" },
    { n: m.programmes, k: "Programmes covered" },
    { n: m.areas, k: "Areas reporting" },
  ];

  return (
    <section className="fade-in">
      <header>
        <h1>Overview</h1>
        <p className="muted">Programme coverage at a glance. Region level only, no personal data.</p>
      </header>

      {degraded ? (
        <p className="pill wait" style={{ marginBottom: "var(--sp-4)" }}>
          The report index is unreachable right now. Metrics and the table show what was last
          available. This is a service degradation, not an empty programme.
        </p>
      ) : null}

      <div className="metrics">
        {cards.map((c) => (
          <div className="metric" key={c.k}>
            <span className="n">{c.n}</span>
            <span className="k">{c.k}</span>
          </div>
        ))}
      </div>

      {attention.length > 0 ? (
        <>
          <h2>Needs attention</h2>
          <div className="attn-list">
            {attention.map((a) => (
              <div className={`attn-item ${a.severity === "high" ? "high" : ""}`} key={a.id}>
                <h3>{a.what}</h3>
                <p>{a.why}</p>
                <p style={{ color: "var(--text)" }}>
                  <strong>Next:</strong> {a.action}
                </p>
              </div>
            ))}
          </div>
          <p className="faint" style={{ fontSize: "0.9rem" }}>
            <Link href="/dashboard/alerts">See all alerts</Link>
          </p>
        </>
      ) : null}

      <h2>Recent reports</h2>
      <DashboardTable proofs={proofs} />
    </section>
  );
}
