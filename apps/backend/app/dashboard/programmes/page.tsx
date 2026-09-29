// programmes/page.tsx: coverage by programme and activity type, not by person. One section per
// programme (Education, Water and sanitation, ...) with its totals and confirmed share, then one card
// per activity inside it. Region level only. Programme headers link to the workspace filtered to that
// programme; activity cards link to it filtered to that activity.

import Link from "next/link";
import { fetchProofs } from "../../../lib/api";
import { activityLabel, programmeGroups, relativeDay, reportsHref } from "../../../lib/dashboard";
import { Icon } from "../../_components/brand";
import { DegradedNotice, EmptyState, PageHeader } from "../ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Programmes" };

function pct(part: number, whole: number): number {
  return whole === 0 ? 0 : Math.round((part / whole) * 100);
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export default async function ProgrammesPage() {
  const { proofs, degraded } = await fetchProofs();
  const groups = programmeGroups(proofs);

  return (
    <section className="fade-in">
      <PageHeader
        eyebrow="Insights"
        title="Programmes"
        lede="Coverage by programme and activity type. No individual identities."
      />

      {degraded ? (
        <DegradedNotice />
      ) : groups.length === 0 ? (
        <EmptyState icon="layers" title="No reports have been received yet">
          Programmes appear here as soon as the first community report arrives.
        </EmptyState>
      ) : (
        <div className="prog-groups">
          {groups.map((g) => {
            const share = pct(g.confirmed, g.received);
            return (
              <section className="prog-group" key={g.name} aria-labelledby={`prog-${g.name}`}>
                <header className="prog-group-head">
                  <div>
                    <h2 id={`prog-${g.name}`}>{g.name}</h2>
                    <p className="muted">
                      {plural(g.activities.length, "activity type", "activity types")} ·{" "}
                      {plural(g.received, "report", "reports")} · {plural(g.areas, "area", "areas")}
                      {g.attention > 0 ? ` · ${g.attention} needing attention` : ""}
                    </p>
                  </div>
                  <div className="prog-group-meter">
                    <div className="meter" role="img" aria-label={`${share}% of ${g.name} reports confirmed`}>
                      <span style={{ width: `${share}%` }} />
                    </div>
                    <span>
                      <strong>{share}%</strong> confirmed
                    </span>
                  </div>
                  <Link className="card-link" href={reportsHref({ programme: g.name })}>
                    All {g.name} reports <Icon name="arrow" size={15} />
                  </Link>
                </header>

                <div className="card-grid">
                  {g.activities.map((r) => {
                    const s = pct(r.confirmed, r.received);
                    return (
                      <article className="prog-card" key={r.taskId}>
                        <div className="prog-top">
                          <span className="activity-avatar" aria-hidden>
                            {activityLabel(r.taskId).charAt(0)}
                          </span>
                          <h3>{activityLabel(r.taskId)}</h3>
                        </div>
                        <p className="prog-count">
                          <strong>{r.received}</strong> {r.received === 1 ? "report" : "reports"}
                        </p>
                        <div className="meter" role="img" aria-label={`${s}% confirmed`}>
                          <span style={{ width: `${s}%` }} />
                        </div>
                        <p className="meter-label">
                          <strong>{r.confirmed}</strong> confirmed · {s}%
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
                          View {plural(r.received, "report", "reports")} <Icon name="arrow" size={15} />
                        </Link>
                      </article>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </section>
  );
}
