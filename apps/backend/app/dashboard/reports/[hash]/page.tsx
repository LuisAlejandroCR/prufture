// reports/[hash]/page.tsx: review one report — status, approximate area, capture time, evidence
// summary, confirmation count and timeline. Unsupported actions are shown disabled and labelled,
// never faked. No reporter identity, exact location or private media path.

import Link from "next/link";
import { fetchProof } from "../../../../lib/api";
import { activityLabel, programmeName, relativeDay, type ReviewStatus } from "../../../../lib/dashboard";
import { Icon } from "../../../_components/brand";
import { EmptyState, StatusPill } from "../../ui";

export const dynamic = "force-dynamic";

function Back() {
  return (
    <Link href="/dashboard/reports" className="back-link">
      <Icon name="back" size={16} /> Back to reports
    </Link>
  );
}

export default async function ReportReviewPage({ params }: { params: Promise<{ hash: string }> }) {
  const { hash } = await params;
  const result = await fetchProof(hash);

  if (result.state !== "ok") {
    return (
      <section className="fade-in">
        <Back />
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
  const status: ReviewStatus =
    proof.attestationCount >= 2 ? "confirmed" : proof.attestationCount === 1 ? "needs-another" : "ready";
  const stages: { label: string; note: string; done: boolean; current?: boolean }[] = [
    { label: "Received", note: "Signed on the phone and delivered.", done: true },
    {
      label: "Under review",
      note: "Visible to the programme team.",
      done: proof.attestationCount >= 1,
      current: proof.attestationCount === 0,
    },
    {
      label: "Second community report",
      note: "Another community member reports the same activity.",
      done: proof.attestationCount >= 2,
      current: proof.attestationCount === 1,
    },
    { label: "Confirmed", note: "Anchored as a public record.", done: proof.attestationCount >= 2 },
  ];
  const captured = new Date(proof.capturedAt);
  const capturedText = Number.isNaN(captured.getTime())
    ? proof.capturedAt
    : captured.toLocaleString("en-GB", { dateStyle: "long", timeStyle: "short" });

  return (
    <section className="fade-in">
      <Back />

      <div className="report-hero">
        <div>
          <p className="dash-eyebrow">{programmeName(proof.taskId)}</p>
          <h1>{activityLabel(proof.taskId)}</h1>
          <div className="report-hero-meta">
            <StatusPill status={status} />
            <span className="muted">Captured {relativeDay(proof.capturedAt).toLowerCase() || "at an unknown time"}</span>
          </div>
        </div>
        <Link className="btn secondary" href={`/verify/${proof.proofHash}`} target="_blank">
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
              <strong><code>{proof.geohashRegion || "not recorded"}</code></strong>
              <span className="fact-note">coarse region only</span>
            </div>
            <div className="fact">
              <span className="fact-icon"><Icon name="clock" /></span>
              <small>Captured</small>
              <strong>{capturedText}</strong>
            </div>
            <div className="fact">
              <span className="fact-icon"><Icon name="users" /></span>
              <small>Confirmations</small>
              <strong>{proof.attestationCount}</strong>
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

          <div className="box">
            <div className="box-head">
              <h2>Actions</h2>
            </div>
            <p className="faint" style={{ fontSize: "0.9rem" }}>
              Review actions are not wired to a backend in this demo. Confirmation happens automatically
              when a second community member reports the same activity.
            </p>
            <button type="button" className="btn secondary" disabled style={{ width: "100%" }}>
              Mark reviewed (not available in this demo)
            </button>
          </div>
        </aside>
      </div>
    </section>
  );
}
