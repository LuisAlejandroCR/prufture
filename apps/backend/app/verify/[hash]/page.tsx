// page.tsx: public /verify/[hash], no login ever. Alternative C style, light like the reporter app:
// sprout brand header, status card, a three-stage timeline (received / community reviewed /
// confirmed), a details card, share card, technical detail collapsed. Honest "not found" and
// "unavailable" states. Coarse region only — no reporter identity, exact location or private media.

import Link from "next/link";
import { assuranceFromProof, assuranceLabel, isNeutralAssurance } from "../../../lib/assurance";
import { fetchProof } from "../../../lib/api";
import { activityLabel } from "../../../lib/dashboard";
import { ShareLink } from "./ShareLink";

const VERIFY_BASE = process.env.NEXT_PUBLIC_VERIFY_BASE_URL ?? "http://localhost:3000";

type Stage = "received" | "waiting" | "confirmed";

function stageFor(count: number): Stage {
  if (count >= 2) return "confirmed";
  if (count === 1) return "waiting";
  return "received";
}

const STAGE_COPY: Record<Stage, { pill: string; cls: string; line: string }> = {
  received: {
    pill: "Report received",
    cls: "info",
    line: "The programme team can review this report. It is not confirmed by another community report yet.",
  },
  waiting: {
    pill: "Waiting for more confirmation",
    cls: "wait",
    line: "One community report is in. It is marked confirmed once a second community member reports the same activity.",
  },
  confirmed: {
    pill: "Report confirmed",
    cls: "ok",
    line: "More than one community member has reported this activity.",
  },
};

function Sprout() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden>
      <path d="M12 21V12.3" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" fill="none" />
      <path d="M12 12.3c0-4 2.6-6.8 7.5-7-0.2 4.7-3 7.3-7.5 7.3Z" fill="currentColor" />
      <path d="M12 14.5c0-3.3-2.2-5.6-6.5-5.8.2 3.9 2.6 6 6.5 6Z" fill="currentColor" />
    </svg>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="verify-page">
      <main className="wrap fade-in">
        <Link href="/" className="v-brand" aria-label="Prufture home">
          <Sprout />
          <span>Prufture</span>
        </Link>
        {children}
      </main>
    </div>
  );
}

const TIMELINE: { label: string; detail: string; doneAt: number }[] = [
  { label: "Received by the programme", detail: "The report reached the public index.", doneAt: 0 },
  { label: "Community reviewed", detail: "Other reports from this area are compared.", doneAt: 1 },
  { label: "Confirmed", detail: "More than one community member reported this activity.", doneAt: 2 },
];

export default async function VerifyPage({ params }: { params: Promise<{ hash: string }> }) {
  const { hash } = await params;
  const result = await fetchProof(hash);
  const shareUrl = `${VERIFY_BASE}/verify/${hash}`;

  if (result.state === "unreachable") {
    return (
      <Shell>
        <h1>Verification temporarily unavailable</h1>
        <p className="muted">
          The public index could not be reached right now. This report is not lost. Please try again
          shortly.
        </p>
      </Shell>
    );
  }

  if (result.state === "not_found") {
    return (
      <Shell>
        <h1>Report not found</h1>
        <p className="muted">
          No report is on file for this reference yet. If a reporter just finished it, the phone may
          not have had signal to send it.
        </p>
      </Shell>
    );
  }

  const { proof } = result;
  const stage = stageFor(proof.attestationCount);
  const copy = STAGE_COPY[stage];
  const assurance = assuranceFromProof(proof);
  const captured = new Date(proof.capturedAt);
  const capturedText = Number.isNaN(captured.getTime())
    ? proof.capturedAt
    : captured.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });

  return (
    <Shell>
      <section className="card v-hero">
        <span className={`pill ${copy.cls}`}>
          <span className="dot" aria-hidden />
          {copy.pill}
        </span>
        <h1>{activityLabel(proof.taskId)}</h1>
        <p className="muted">{copy.line}</p>
      </section>

      <ol className="timeline v-timeline" aria-label="Report progress">
        {TIMELINE.map((t, i) => {
          const done = proof.attestationCount >= t.doneAt;
          const current = !done && (i === 0 || proof.attestationCount >= (TIMELINE[i - 1]?.doneAt ?? 0));
          return (
            <li key={t.label} className={done ? "done" : current ? "current" : "upcoming"}>
              <div>
                <div className="node" aria-hidden>
                  {done ? "✓" : ""}
                </div>
                {i < TIMELINE.length - 1 ? <div className="rail" /> : null}
              </div>
              <div className="stage">
                <b>{t.label}</b>
                <span className="muted v-detail">{t.detail}</span>
              </div>
            </li>
          );
        })}
      </ol>

      <section className="card">
        <h2 className="v-card-title">Report details</h2>
        <dl className="fields">
          <dt>Approximate area</dt>
          <dd>
            <code>{proof.geohashRegion || "not recorded"}</code>{" "}
            <span className="faint">coarse region only</span>
          </dd>
          <dt>Captured</dt>
          <dd>{capturedText}</dd>
          <dt>Confirmations</dt>
          <dd>{proof.attestationCount}</dd>
          <dt>Identity check</dt>
          <dd className={isNeutralAssurance(assurance) ? "faint" : undefined}>{assuranceLabel(assurance)}</dd>
          <dt>Public reference</dt>
          <dd>
            <code>{proof.proofHash.slice(0, 12)}...</code>
          </dd>
        </dl>
      </section>

      <section className="card v-share">
        <h2 className="v-card-title">Share this report</h2>
      <p className="muted">
        This link carries only the public reference. No reporter identity, photo, or exact location
        is stored or shown, so it is safe to send over a chat or email.
      </p>
      <ShareLink url={shareUrl} />
      </section>

      <details className="tech">
        <summary>Technical details</summary>
        <div>
          <dl className="fields">
            <dt>Full reference</dt>
            <dd>
              <code>{proof.proofHash}</code>
            </dd>
            <dt>Captured (UTC)</dt>
            <dd>
              <code>{proof.capturedAt}</code>
            </dd>
          </dl>
          {proof.attestations.length > 0 ? (
            <ul className="plain">
              {proof.attestations.map((a) => (
                <li key={a.txHash}>
                  <a
                    href={`https://base-sepolia.blockscout.com/tx/${a.txHash}`}
                    rel="noreferrer noopener"
                    target="_blank"
                  >
                    External record {a.txHash.slice(0, 14)}...
                  </a>{" "}
                  <span className="faint">{a.attestedAt}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="faint" style={{ marginBottom: 0 }}>
              No external record yet. A second community report, or the delivery service coming back
              online, will add one.
            </p>
          )}
        </div>
      </details>
    </Shell>
  );
}
