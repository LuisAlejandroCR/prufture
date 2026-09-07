// reports/[hash]/page.tsx: review one report. Activity and status, approximate area
// and capture time, a safe evidence summary, the confirmation count, and a review
// timeline. Actions that the current backend does not support are shown as disabled
// and labelled, never faked. No reporter identity, no exact location, no private
// media path.

import Link from "next/link";
import { fetchProof } from "../../../../lib/api";
import { activityLabel, programmeName, REVIEW_CLASS, REVIEW_LABEL } from "../../../../lib/dashboard";

export const dynamic = "force-dynamic";

export default async function ReportReviewPage({ params }: { params: Promise<{ hash: string }> }) {
  const { hash } = await params;
  const result = await fetchProof(hash);

  if (result.state !== "ok") {
    return (
      <section className="fade-in">
        <p>
          <Link href="/dashboard/reports" className="rowlink">
            Back to reports
          </Link>
        </p>
        <h1>{result.state === "not_found" ? "Report not found" : "Report index unavailable"}</h1>
        <p className="muted">
          {result.state === "not_found"
            ? "No report is on file for this reference."
            : "The report index could not be reached right now. Try again shortly."}
        </p>
      </section>
    );
  }

  const { proof } = result;
  const status =
    proof.attestationCount >= 2 ? "confirmed" : proof.attestationCount === 1 ? "needs-another" : "ready";
  const stages: { label: string; done: boolean; current?: boolean }[] = [
    { label: "Received", done: true },
    { label: "Under review", done: proof.attestationCount >= 1, current: proof.attestationCount === 0 },
    {
      label: "Second community report",
      done: proof.attestationCount >= 2,
      current: proof.attestationCount === 1,
    },
    { label: "Confirmed", done: proof.attestationCount >= 2 },
  ];
  const captured = new Date(proof.capturedAt);

  return (
    <section className="fade-in">
      <p>
        <Link href="/dashboard/reports" className="rowlink">
          Back to reports
        </Link>
      </p>

      <header>
        <h1>{activityLabel(proof.taskId)}</h1>
        <span className={`pill ${REVIEW_CLASS[status]}`}>
          <span className="dot" aria-hidden />
          {REVIEW_LABEL[status]}
        </span>
      </header>

      <dl className="fields">
        <dt>Programme</dt>
        <dd>{programmeName(proof.taskId)}</dd>
        <dt>Approximate area</dt>
        <dd>
          <code>{proof.geohashRegion || "not recorded"}</code>{" "}
          <span className="faint">coarse region only</span>
        </dd>
        <dt>Captured</dt>
        <dd>{Number.isNaN(captured.getTime()) ? proof.capturedAt : captured.toLocaleString()}</dd>
        <dt>Confirmations</dt>
        <dd>{proof.attestationCount}</dd>
      </dl>

      <h2>Evidence summary</h2>
      <p className="muted">
        The reporter&apos;s photos and answers stay on their device. The shared record carries the
        activity, the approximate area, the capture time, and the public reference only.
      </p>

      <h2>Review timeline</h2>
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
            </div>
          </li>
        ))}
      </ol>

      <h2>Actions</h2>
      <p className="faint" style={{ fontSize: "0.9rem" }}>
        Review actions are not wired to a backend in this demo. Confirmation happens automatically
        when a second community member reports the same activity.
      </p>
      <button type="button" className="btn secondary" disabled>
        Mark reviewed (not available in this demo)
      </button>

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
                    href={`https://sepolia.basescan.org/tx/${a.txHash}`}
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
    </section>
  );
}
