// page.tsx: public /verify/[hash], no login ever. Plain-language lifecycle (received / waiting for
// confirmation / confirmed) plus honest "not found" and "unavailable" states, with technical detail
// collapsed. Coarse region only — no reporter identity, exact location or private media.

import Link from "next/link";
import { assuranceFromProof, assuranceLabel, isNeutralAssurance } from "../../../lib/assurance";
import { fetchProof } from "../../../lib/api";
import { activityLabel, programmeName } from "../../../lib/dashboard";
import { Icon, SiteFooter, SiteHeader, type IconName } from "../../_components/brand";
import { qrPath } from "../../pitch/qr";
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

const STAGES: { key: Stage; label: string }[] = [
  { key: "received", label: "Received" },
  { key: "waiting", label: "Waiting for confirmation" },
  { key: "confirmed", label: "Confirmed" },
];

/** Tab and link-preview title (chat apps show it when the link is shared). Same fields as the page:
 *  activity and plain status only, never a region, reporter or reference. */
export async function generateMetadata({ params }: { params: Promise<{ hash: string }> }) {
  const { hash } = await params;
  const r = await fetchProof(hash);
  if (r.state !== "ok") return { title: "Field report · Prufture" };
  const title = `${activityLabel(r.proof.taskId)} · ${STAGE_COPY[stageFor(r.proof.attestationCount)].pill}`;
  const description = "A community field report on Prufture. Checkable by anyone, with no personal data.";
  return { title: `${title} · Prufture`, description, openGraph: { title, description, siteName: "Prufture" } };
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="site">
      <SiteHeader />
      <main className="site-body fade-in">{children}</main>
      <SiteFooter />
    </div>
  );
}

function StateCard({ icon, title, children }: { icon: IconName; title: string; children: React.ReactNode }) {
  return (
    <div className="verify-hero state-card">
      <div className="state-icon">
        <Icon name={icon} size={26} />
      </div>
      <h1>{title}</h1>
      <p className="muted">{children}</p>
      <Link className="btn secondary" href="/">
        Back to Prufture
      </Link>
    </div>
  );
}

export default async function VerifyPage({ params }: { params: Promise<{ hash: string }> }) {
  const { hash } = await params;
  const result = await fetchProof(hash);
  const shareUrl = `${VERIFY_BASE}/verify/${hash}`;

  if (result.state === "unreachable") {
    return (
      <Shell>
        <StateCard icon="signal" title="Verification temporarily unavailable">
          The public index could not be reached right now. This report is not lost. Please try again
          shortly.
        </StateCard>
      </Shell>
    );
  }

  if (result.state === "not_found") {
    return (
      <Shell>
        <StateCard icon="reports" title="Report not found">
          No report is on file for this reference yet. If a reporter just finished it, the phone may
          not have had signal to send it.
        </StateCard>
      </Shell>
    );
  }

  const { proof } = result;
  const stage = stageFor(proof.attestationCount);
  const copy = STAGE_COPY[stage];
  const stageIndex = STAGES.findIndex((s) => s.key === stage);
  // Encodes only the public link (proofHash), the same thing the share field shows.
  const qr = qrPath(shareUrl);
  const assurance = assuranceFromProof(proof);
  const captured = new Date(proof.capturedAt);
  const capturedText = Number.isNaN(captured.getTime())
    ? proof.capturedAt
    : captured.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });

  return (
    <Shell>
      <section className="verify-hero">
        <p className="eyebrow-label">Public field report</p>
        <span className={`pill ${copy.cls}`}>
          <span className="dot" aria-hidden />
          {copy.pill}
        </span>
        <h1>{activityLabel(proof.taskId)}</h1>
        <p className="lede">{copy.line}</p>
        <ol className="stepper" aria-label="Report progress">
          {STAGES.map((s, i) => (
            <li
              key={s.key}
              className={i <= stageIndex ? "done" : i === stageIndex + 1 ? "current" : "upcoming"}
              aria-current={i === stageIndex ? "step" : undefined}
            >
              {s.label}
            </li>
          ))}
        </ol>
      </section>

      <div className="fact-grid">
        <div className="fact">
          <span className="fact-icon"><Icon name="layers" /></span>
          <small>Activity</small>
          <strong>{activityLabel(proof.taskId)}</strong>
          <span className="fact-note">{programmeName(proof.taskId)}</span>
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
        <div className={`fact ${isNeutralAssurance(assurance) ? "is-neutral" : ""}`}>
          <span className="fact-icon"><Icon name="shield" /></span>
          <small>Anonymous pass</small>
          <strong>{assuranceLabel(assurance)}</strong>
        </div>
        <div className="fact">
          <span className="fact-icon"><Icon name="link" /></span>
          <small>Public reference</small>
          <strong><code>{proof.proofHash.slice(0, 12)}...</code></strong>
        </div>
      </div>

      <section className="share-card share-grid">
        <div>
          <h2>Share this report</h2>
          <p className="muted" style={{ margin: 0 }}>
            This link carries only the public reference. No reporter identity, photo, or exact
            location is stored or shown, so it is safe to send over a chat or email.
          </p>
          <ShareLink url={shareUrl} />
          <ul className="privacy-list">
            <li><Icon name="eyeOff" size={16} /> No name or face</li>
            <li><Icon name="pin" size={16} /> No exact location</li>
            <li><Icon name="lock" size={16} /> No account needed</li>
          </ul>
        </div>
        <figure className="share-qr">
          <svg viewBox={`0 0 ${qr.size} ${qr.size}`} role="img" aria-label="QR code of this report's public link">
            <rect width={qr.size} height={qr.size} fill="#fbf6ef" />
            <path d={qr.path} fill="#1c1208" />
          </svg>
          <figcaption>Scan to open on a phone</figcaption>
        </figure>
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
