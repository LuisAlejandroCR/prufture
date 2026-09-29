// programmes/page.tsx: coverage by activity type, not by person — one card per activity with
// reports received, the confirmed share, reports needing attention, areas touched and last activity.
// Region level only. Each card links to the workspace filtered to that activity.

import Link from "next/link";
import { fetchProofs } from "../../../lib/api";
import { activityLabel, programmeName, programmes, relativeDay, reportsHref } from "../../../lib/dashboard";
import { Icon } from "../../_components/brand";
import { DegradedNotice, EmptyState, PageHeader } from "../ui";

export const dynamic = "force-dynamic";

export default async function ProgrammesPage() {
  const { proofs, degraded } = await fetchProofs();
  const rows = programmes(proofs);

  return (
    <section className="fade-in">
      <PageHeader
        eyebrow="Insights"
        title="Programmes"
        lede="Coverage by activity type. No individual identities."
      />

      {degraded ? (
        <DegradedNotice />
      ) : rows.length === 0 ? (
        <EmptyState icon="layers" title="No reports have been received yet">
          Activities appear here as soon as the first community report arrives.
        </EmptyState>
      ) : (
        <div className="card-grid">
          {rows.map((r) => {
            const share = r.received === 0 ? 0 : Math.round((r.confirmed / r.received) * 100);
            return (
              <article className="prog-card" key={r.taskId}>
                <div className="prog-top">
                  <span className="activity-avatar" aria-hidden>
                    {activityLabel(r.taskId).charAt(0)}
                  </span>
                  <div>
                    <h3>{activityLabel(r.taskId)}</h3>
                    <small>{programmeName(r.taskId)}</small>
                  </div>
                </div>
                <p className="prog-count">
                  <strong>{r.received}</strong> {r.received === 1 ? "report" : "reports"}
                </p>
                <div className="meter" role="img" aria-label={`${share}% confirmed`}>
                  <span style={{ width: `${share}%` }} />
                </div>
                <p className="meter-label">
                  <strong>{r.confirmed}</strong> confirmed · {share}%
                </p>
                <dl className="prog-stats">
                  <div>
                    <dt>Needing attention</dt>
                    <dd>{r.attention}</dd>
                  </div>
                  <div>
                    <dt>Areas</dt>
                    <dd>{r.areas}</dd>
                  </div>
                  <div>
                    <dt>Last activity</dt>
                    <dd>{relativeDay(r.lastActivity) || "not recorded"}</dd>
                  </div>
                </dl>
                <Link className="card-link" href={reportsHref({ q: activityLabel(r.taskId) })}>
                  View {r.received} {r.received === 1 ? "report" : "reports"} <Icon name="arrow" size={15} />
                </Link>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
