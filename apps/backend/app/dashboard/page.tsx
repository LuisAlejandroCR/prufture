// page.tsx: /dashboard Overview — four summary metrics, the review pipeline and 14-day activity
// charts, the attention panel and the latest reports. Fetched server-side; region level only, no
// personal data, no exact location.

import Link from "next/link";
import { fetchProofs } from "../../lib/api";
import { alerts, dailyCounts, metrics, statusBreakdown } from "../../lib/dashboard";
import { Icon } from "../_components/brand";
import { ActivityChart, StatusBar } from "./Charts";
import { DashboardTable } from "./DashboardTable";
import { DegradedNotice, Metric, PageHeader } from "./ui";

export const dynamic = "force-dynamic";

export default async function DashboardOverview() {
  const { proofs, degraded } = await fetchProofs();
  const m = metrics(proofs);
  const attention = alerts(proofs, degraded);
  const today = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

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

      <div className="metrics">
        <Metric icon="inbox" value={m.thisWeek} label="Reports this week" hint={`${proofs.length} received in total`} />
        <Metric icon="clock" value={m.readyToReview} label="Ready to review" hint="No confirmation yet" tone="info" />
        <Metric icon="users" value={m.needAnother} label="Need another report" hint="One community report in" tone="wait" />
        <Metric icon="layers" value={m.programmes} label="Programmes covered" hint={`${m.areas} approximate ${m.areas === 1 ? "area" : "areas"}`} tone="ok" />
      </div>

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
                <div className={`attn-item ${a.severity === "high" ? "high" : ""}`} key={a.id}>
                  <span className="attn-icon">
                    <Icon name={a.severity === "high" ? "alert" : a.id === "needs-second" ? "users" : "clock"} />
                  </span>
                  <div>
                    <h3>{a.what}</h3>
                    <p>{a.why}</p>
                    <p className="attn-next">
                      <strong>Next:</strong> {a.action}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="section-head">
        <h2>Latest reports</h2>
        <Link className="box-link" href="/dashboard/reports">
          Open workspace
        </Link>
      </div>
      <DashboardTable proofs={proofs} compact />
    </section>
  );
}
