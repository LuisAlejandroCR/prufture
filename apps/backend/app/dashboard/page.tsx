// page.tsx: /dashboard Overview — four summary metrics, the review pipeline and 14-day activity
// charts, the attention panel and the latest reports. Fetched server-side; region level only, no
// personal data, no exact location.

import Link from "next/link";
import { fetchProofs } from "../../lib/api";
import { alerts, dailyCounts, metrics, reportsHref, statusBreakdown, weekTrend } from "../../lib/dashboard";
import { Icon } from "../_components/brand";
import { ActivityChart, StatusBar } from "./Charts";
import { DashboardTable } from "./DashboardTable";
import { AlertCard, DegradedNotice, Metric, PageHeader } from "./ui";

export const dynamic = "force-dynamic";

/** Shown on a healthy index with no reports yet: what will appear here and how reports arrive,
 *  instead of a wall of zeros. Every step describes what the product actually does. */
function FirstRun() {
  const steps: { icon: "signal" | "lock" | "users"; title: string; body: string }[] = [
    {
      icon: "signal",
      title: "A volunteer captures the activity",
      body: "In the Prufture app, offline if needed. No account and no personal data.",
    },
    {
      icon: "lock",
      title: "The phone signs and sends it",
      body: "When signal returns it shares a photo fingerprint, the activity, an approximate area and the time. The photo stays on the phone.",
    },
    {
      icon: "users",
      title: "It appears here for review",
      body: "A second community report of the same activity marks it confirmed.",
    },
  ];
  return (
    <div className="first-run box">
      <div>
        <p className="dash-eyebrow">Getting started</p>
        <h2>No reports yet</h2>
        <p className="muted">
          This workspace fills in as community reports arrive. Here is how the first one gets here.
        </p>
      </div>
      <ol className="first-run-steps">
        {steps.map((s, i) => (
          <li key={s.title}>
            <span className="first-run-icon">
              <Icon name={s.icon} />
            </span>
            <div>
              <strong>
                {i + 1}. {s.title}
              </strong>
              <p>{s.body}</p>
            </div>
          </li>
        ))}
      </ol>
      <Link className="card-link" href="/#how">
        See how Prufture works <Icon name="arrow" size={15} />
      </Link>
    </div>
  );
}

export default async function DashboardOverview() {
  const { proofs, degraded } = await fetchProofs();
  const m = metrics(proofs);
  // A healthy index with nothing in it yet. A degraded index is never "empty": it gets the alert.
  const empty = !degraded && proofs.length === 0;
  const attention = alerts(proofs, degraded);
  const today = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  // Matches metrics().thisWeek closely enough for a link: the last seven UTC days, today included.
  const weekStart = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  return (
    <section className="fade-in">
      <PageHeader
        eyebrow={today}
        title="Today's impact"
        accent="reports"
        lede="See what communities have documented and where your attention is needed."
        actions={
          <Link className="btn" href="/dashboard/reports">
            Review reports <Icon name="arrow" size={16} />
          </Link>
        }
      />

      {degraded ? <DegradedNotice /> : null}

      {empty ? <FirstRun /> : null}

      <div className="metrics">
        <Metric
          icon="inbox"
          value={m.thisWeek}
          label="Reports this week"
          hint={`${proofs.length} received in total`}
          trend={m.thisWeek + m.lastWeek > 0 ? weekTrend(m.thisWeek, m.lastWeek) : undefined}
          href={reportsHref({ from: weekStart })}
        />
        <Metric
          icon="clock"
          value={m.readyToReview}
          label="Ready to review"
          hint="No confirmation yet"
          tone="info"
          href={reportsHref({ status: "ready" })}
        />
        <Metric
          icon="users"
          value={m.needAnother}
          label="Need another report"
          hint="One community report in"
          tone="wait"
          href={reportsHref({ status: "needs-another" })}
        />
        <Metric
          icon="layers"
          value={m.programmes}
          label="Programmes covered"
          hint={`${m.activities} activity ${m.activities === 1 ? "type" : "types"} · ${m.areas} ${m.areas === 1 ? "area" : "areas"}`}
          tone="ok"
          href="/dashboard/programmes"
        />
      </div>

      {/* With a healthy index and no reports, empty charts and an empty table add nothing. */}
      {empty ? null : (
        <div className="dash-grid">
          <div className="box">
            <div className="box-head">
              <h2>Review pipeline</h2>
              <span className="box-meta">{m.confirmed} confirmed</span>
            </div>
            <StatusBar rows={statusBreakdown(proofs)} />
            <div className="box-sep" />
            <div className="box-head">
              <h2>Reports received</h2>
              <span className="box-meta">Last 14 days</span>
            </div>
            <ActivityChart series={dailyCounts(proofs, 14)} />
          </div>

          <div className="box">
            <div className="box-head">
              <h2>Needs attention</h2>
              <Link className="box-link" href="/dashboard/alerts">
                All alerts
              </Link>
            </div>
            {attention.length === 0 ? (
              <div className="all-clear">
                <span className="mini-check">
                  <Icon name="check" />
                </span>
                <div>
                  <strong>Nothing needs attention</strong>
                  <p>No degraded services, stale reports or coverage gaps.</p>
                </div>
              </div>
            ) : (
              <div className="attn-list">
                {attention.slice(0, 3).map((a) => (
                  <AlertCard alert={a} key={a.id} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {empty ? null : (
        <>
          <div className="section-head">
            <h2>Latest reports</h2>
            <Link className="box-link" href="/dashboard/reports">
              Open workspace
            </Link>
          </div>
          <DashboardTable proofs={proofs} compact />
        </>
      )}
    </section>
  );
}
