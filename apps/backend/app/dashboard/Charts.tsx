// Charts.tsx: the two Overview charts, pure markup + CSS (no chart library). StatusBar is one
// stacked bar of review statuses with a labelled legend, so status is never colour-alone.
// ActivityChart is a single-series column chart of reports per day with a hover/focus tooltip
// and a screen-reader list. Inputs are aggregate counts only. Each legend row links to the
// workspace filtered to that status.

import Link from "next/link";
import { REVIEW_CLASS, REVIEW_LABEL, reportsHref, type ReviewStatus } from "../../lib/dashboard";

export function StatusBar({ rows }: { rows: { status: ReviewStatus; count: number }[] }) {
  const total = rows.reduce((n, r) => n + r.count, 0);
  const pct = (n: number) => (total === 0 ? 0 : Math.round((n / total) * 100));

  return (
    <div className="statusbar">
      <div className="statusbar-track" role="img" aria-label={rows.map((r) => `${REVIEW_LABEL[r.status]} ${r.count}`).join(", ")}>
        {total === 0 ? <span className="statusbar-empty" /> : null}
        {rows
          .filter((r) => r.count > 0)
          .map((r) => (
            <span
              key={r.status}
              className={`statusbar-seg ${REVIEW_CLASS[r.status]}`}
              style={{ flexGrow: r.count }}
              title={`${REVIEW_LABEL[r.status]}: ${r.count} (${pct(r.count)}%)`}
            />
          ))}
      </div>
      <ul className="statusbar-legend">
        {rows.map((r) => (
          <li key={r.status}>
            <Link href={reportsHref({ status: r.status })} aria-label={`${REVIEW_LABEL[r.status]}: ${r.count} reports. Open this list`}>
              <span className={`legend-dot ${REVIEW_CLASS[r.status]}`} aria-hidden />
              <span className="legend-label">{REVIEW_LABEL[r.status]}</span>
              <strong>{r.count}</strong>
              <span className="legend-pct">{pct(r.count)}%</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function shortDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

export function ActivityChart({ series }: { series: { day: string; count: number }[] }) {
  const max = Math.max(1, ...series.map((d) => d.count));
  const total = series.reduce((n, d) => n + d.count, 0);
  // An even axis top keeps the midline label an honest integer at its true position.
  const top = Math.max(2, Math.ceil(max / 2) * 2);

  return (
    <div className="activity">
      <div className="activity-plot" aria-hidden="true">
        <div className="activity-grid">
          <span data-v={top} />
          <span data-v={top / 2} />
          <span data-v={0} />
        </div>
        <div className="activity-cols">
          {series.map((d, i) => (
            <div className="activity-col" key={d.day}>
              <span className="activity-bar" style={{ height: `${(d.count / top) * 100}%` }} data-zero={d.count === 0 || undefined} />
              <span className="activity-tip">
                <strong>{d.count}</strong> {d.count === 1 ? "report" : "reports"}
                <small>{shortDay(d.day)}</small>
              </span>
              {i === 0 || i === series.length - 1 || i === Math.floor(series.length / 2) ? (
                <span className="activity-x">{i === series.length - 1 ? "Today" : shortDay(d.day)}</span>
              ) : null}
            </div>
          ))}
        </div>
      </div>
      <ul className="sr-only">
        {series.map((d) => (
          <li key={d.day}>
            {shortDay(d.day)}: {d.count} {d.count === 1 ? "report" : "reports"}
          </li>
        ))}
      </ul>
      <p className="activity-foot">
        <strong>{total}</strong> {total === 1 ? "report" : "reports"} in the last {series.length} days
      </p>
    </div>
  );
}
