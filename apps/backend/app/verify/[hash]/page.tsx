// page.tsx: public /verify/[hash]. No login, ever. Plain-language lifecycle:
// Report received / Waiting for more confirmation / Report confirmed, plus honest
// "not found" and "temporarily unavailable" states. Shows the activity, an
// approximate area (coarse region only), the capture date, the status, the number
// of confirmations, and a public reference. The full reference and any external
// record link live inside a collapsed technical section. No reporter identity, no
// exact location, no private media.

import Link from "next/link";
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

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="wrap fade-in">
      <p style={{ marginBottom: "var(--sp-4)" }}>
        <Link href="/" className="faint" style={{ fontSize: "0.9rem", textDecoration: "none" }}>
          Prufture
        </Link>
      </p>
      {children}
    </main>
  );
}

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
  const captured = new Date(proof.capturedAt);
  const capturedText = Number.isNaN(captured.getTime())
    ? proof.capturedAt
    : captured.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });

  return (
    <Shell>
      <h1>{copy.pill}</h1>
      <span className={`pill ${copy.cls}`}>
        <span className="dot" aria-hidden />
        {copy.pill}
      </span>
      <p className="muted" style={{ marginTop: "var(--sp-3)" }}>
        {copy.line}
      </p>

      <dl className="fields">
        <dt>Activity</dt>
        <dd>{activityLabel(proof.taskId)}</dd>
        <dt>Approximate area</dt>
        <dd>
          <code>{proof.geohashRegion || "not recorded"}</code>{" "}
          <span className="faint">coarse region only</span>
        </dd>
        <dt>Captured</dt>
        <dd>{capturedText}</dd>
        <dt>Confirmations</dt>
        <dd>{proof.attestationCount}</dd>
        <dt>Captured by a verified person</dt>
        <dd>{proof.verifiedPerson === true ? "Yes" : "Not verified"}</dd>
        <dt>Public reference</dt>
        <dd>
          <code>{proof.proofHash.slice(0, 12)}...</code>
        </dd>
      </dl>

      <h2>Share this report</h2>
      <p className="muted">
        This link carries only the public reference. No reporter identity, photo, or exact location
        is stored or shown, so it is safe to send over a chat or email.
      </p>
      <ShareLink url={shareUrl} />

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
