// reports/[hash]/page.tsx: review one report — status, approximate area, capture time, evidence
// summary, confirmation count and timeline. Actions are real links only: review decisions are made in
// the app's coordinator inbox, and this page says so instead of showing a dead button. No reporter
// identity, exact location or private media path. The workspace view it was opened from rides along
// in the query string, so Back returns to that exact view and Previous / Next step through it.

import Link from "next/link";
import { fetchProof, fetchProofs } from "../../../../lib/api";
import {
  activityLabel,
  applyReportFilters,
  neighbours,
  parseReportFilters,
  programmeName,
  relativeDay,
  reportsHref,
  reportsQuery,
  reviewStatus,
  type ReportFilters,
} from "../../../../lib/dashboard";
import { Icon } from "../../../_components/brand";
import { EmptyState, StatusPill } from "../../ui";
import { placeLabel } from "../../../../lib/places";
import { PagerKeys } from "./PagerKeys";

export const dynamic = "force-dynamic";

type Search = Record<string, string | string[] | undefined>;

export async function generateMetadata({ params }: { params: Promise<{ hash: string }> }) {
  const { hash } = await params;
  const r = await fetchProof(hash);
  return { title: r.state === "ok" ? `${activityLabel(r.proof.taskId)} · Review` : "Report" };
}

function Back({ filters }: { filters: ReportFilters }) {
  return (
    <Link href={reportsHref(filters)} className="back-link">
      <Icon name="back" size={16} /> Back to reports
    </Link>
  );
}

export default async function ReportReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ hash: string }>;
  searchParams: Promise<Search>;
}) {
  const [{ hash }, sp] = await Promise.all([params, searchParams]);
  const filters = parseReportFilters({ get: (k) => (typeof sp[k] === "string" ? (sp[k] as string) : null) });
  const [result, list] = await Promise.all([fetchProof(hash), fetchProofs()]);
  const view = list.degraded ? null : neighbours(applyReportFilters(list.proofs, filters), hash);
  const q = reportsQuery(filters);

  if (result.state !== "ok") {
    return (
      <section className="fade-in">
        <Back filters={filters} />
        <EmptyState
          icon={result.state === "not_found" ? "reports" : "signal"}
          title={result.state === "not_found" ? "Report not found" : "Report index unavailable"}
        >
          {result.state === "not_found"
            ? "No report is on file for this reference."
            : "The report index could not be reached right now. Try again shortly."}
        </EmptyState>
      </section>
    );
  }

  const { proof } = result;
  // Same rule as the table, including "needs attention" for unreviewed reports older than 3 days.
  const status = reviewStatus(proof);
  // Same rule as the public page: "confirmed" comes from the api's community check, never from
  // the on-chain count (one relayer anchors each proof once, so that count is 0 or 1).
  const anchored = proof.attestationCount >= 1;
  const confirmed = proof.communityConfirmed;
  const stages: { label: string; note: string; done: boolean; current?: boolean }[] = [
    { label: "Received", note: "Signed on the phone and delivered.", done: true },
    {
      label: "Public record",
      note: "Anchored so anyone can check it was not changed.",
      done: anchored,
      current: !anchored && !confirmed,
    },
    {
      label: "Second community report",
      note: "Another community member with a programme pass reports the same activity nearby.",
      done: confirmed,
      current: anchored && !confirmed,
    },
    { label: "Confirmed", note: "Two community reports agree.", done: confirmed },
  ];
  const captured = new Date(proof.capturedAt);
  const capturedText = Number.isNaN(captured.getTime())
    ? proof.capturedAt
    : captured.toLocaleString("en-GB", { dateStyle: "long", timeStyle: "short" });

  return (
    <section className="fade-in">
      <div className="report-nav">
        <Back filters={filters} />
        {view ? (
          <nav className="pager" aria-label="Reports in this view">
            <PagerKeys
              prev={view.prev ? `/dashboard/reports/${view.prev.proofHash}${q}` : null}
              next={view.next ? `/dashboard/reports/${view.next.proofHash}${q}` : null}
            />
            <span className="pager-pos" title="Press k for previous, j for next">
              {view.index + 1} of {view.total}
            </span>
            {view.prev ? (
              <Link className="pager-btn" href={`/dashboard/reports/${view.prev.proofHash}${q}`} rel="prev" aria-label={`Previous: ${activityLabel(view.prev.taskId)}`}>
                <Icon name="back" size={16} />
              </Link>
            ) : (
              <span className="pager-btn is-off" aria-hidden>
                <Icon name="back" size={16} />
              </span>
            )}
            {view.next ? (
              <Link className="pager-btn" href={`/dashboard/reports/${view.next.proofHash}${q}`} rel="next" aria-label={`Next: ${activityLabel(view.next.taskId)}`}>
                <Icon name="arrow" size={16} />
              </Link>
            ) : (
              <span className="pager-btn is-off" aria-hidden>
                <Icon name="arrow" size={16} />
              </span>
            )}
          </nav>
        ) : null}
      </div>

      <div className="report-hero">
        <div>
          <p className="dash-eyebrow">{programmeName(proof.taskId)}</p>
          <h1>{activityLabel(proof.taskId)}</h1>
          <div className="report-hero-meta">
            <StatusPill status={status} />
            <span className="muted">Captured {relativeDay(proof.capturedAt).toLowerCase() || "at an unknown time"}</span>
          </div>
        </div>
        <Link className="btn secondary" href={`/verify/${proof.proofHash}`} target="_blank" rel="noreferrer noopener">
          Public page <Icon name="external" size={16} />
        </Link>
      </div>

      <div className="report-grid">
        <div className="report-main">
          <div className="facts">
            <div className="fact">
              <span className="fact-icon"><Icon name="layers" /></span>
              <small>Programme</small>
              <strong>{programmeName(proof.taskId)}</strong>
            </div>
            <div className="fact">
              <span className="fact-icon"><Icon name="pin" /></span>
              <small>Approximate area</small>
              <strong>
                {proof.geohashRegion ? (
                  <Link className="fact-link" href={reportsHref({ area: proof.geohashRegion })}>
                    {placeLabel(proof.geohashRegion) || <code>{proof.geohashRegion}</code>}
                  </Link>
                ) : (
                  <code>not recorded</code>
                )}
              </strong>
              <span className="fact-note">
                {placeLabel(proof.geohashRegion) ? <>region <code>{proof.geohashRegion}</code> · </> : null}coarse region only
              </span>
            </div>
            <div className="fact">
              <span className="fact-icon"><Icon name="clock" /></span>
              <small>Captured</small>
              <strong>{capturedText}</strong>
            </div>
            <div className="fact">
              <span className="fact-icon"><Icon name="users" /></span>
              <small>Public record</small>
              <strong>{anchored ? "Anchored" : "Not yet"}</strong>
            </div>
          </div>

          <div className="box">
            <div className="box-head">
              <h2>Evidence summary</h2>
            </div>
            <p className="muted">
              The reporter&apos;s photos and answers stay on their device. The shared record carries the
              activity, the approximate area, the capture time, and the public reference only.
            </p>
            <ul className="privacy-list">
              <li><Icon name="eyeOff" size={16} /> No name, phone or face</li>
              <li><Icon name="pin" size={16} /> No exact location</li>
              <li><Icon name="lock" size={16} /> Signed on the reporter&apos;s phone</li>
            </ul>
          </div>

          <p className="print-only faint">
            Public reference <code>{proof.proofHash}</code>. Anyone can check this report, without an
            account, on its public /verify page.
          </p>
          <details className="tech">
            <summary>Technical details</summary>
            <div>
              <dl className="fields">
                <dt>Full reference</dt>
                <dd>
                  <code>{proof.proofHash}</code>
                </dd>
              </dl>
              {proof.attestations.length > 0 ? (
                <ul className="plain">
                  {proof.attestations.map((a) => (
                    <li key={a.txHash}>
                      <a
                        href={`https://base-sepolia.blockscout.com/tx/${a.txHash}`}
                        target="_blank"
                        rel="noreferrer noopener"
                      >
                        External record {a.txHash.slice(0, 14)}...
                      </a>{" "}
                      <span className="faint">{a.attestedAt}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="faint" style={{ marginBottom: 0 }}>
                  No external record yet.
                </p>
              )}
            </div>
          </details>
        </div>

        <aside className="report-side">
          <div className="box">
            <div className="box-head">
              <h2>Review timeline</h2>
            </div>
            <ol className="timeline">
              {stages.map((s, i) => (
                <li key={s.label} className={s.done ? "done" : s.current ? "current" : "upcoming"}>
                  <div>
                    <div className="node" aria-hidden>
                      {s.done ? "✓" : ""}
                    </div>
                    {i < stages.length - 1 ? <div className="rail" /> : null}
                  </div>
                  <div className="stage">
                    <b>{s.label}</b>
                    <span>{s.note}</span>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <div className="box report-actions">
            <div className="box-head">
              <h2>Actions</h2>
            </div>
            <p className="faint" style={{ fontSize: "0.9rem" }}>
              Accept or reject a report in the coordinator inbox of the Prufture app. Confirmation
              happens on its own when a second community member reports the same activity nearby.
            </p>
            <div className="report-action-links">
              {proof.geohashRegion ? (
                <Link className="btn secondary" href={reportsHref({ area: proof.geohashRegion })}>
                  <Icon name="pin" size={16} /> Other reports in this area
                </Link>
              ) : null}
              <Link className="btn secondary" href={reportsHref({ q: activityLabel(proof.taskId) })}>
                <Icon name="reports" size={16} /> All {activityLabel(proof.taskId)} reports
              </Link>
              <Link className="btn secondary" href="/dashboard/map">
                <Icon name="map" size={16} /> See it on the coverage map
              </Link>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
