// page.tsx: landing for judges, partners, and community organizations. Not the
// reporter workflow. Plain-language proposition, offline-first, privacy, a three-step
// process, links to a sample report and the dashboard, open-source and honest status.
// Every claim stays true to what the code does: no ZK, TEE, or deployment claim.

import Link from "next/link";

const SAMPLE_HASH =
  process.env.NEXT_PUBLIC_SAMPLE_HASH ??
  "992f8d6232210e99a6ed60a9c23dc22b3a304cd0c0d13bbdecf16f3c573d5d75";

export default function Home() {
  return (
    <main className="wrap fade-in">
      <div className="hero">
        <div className="hero-copy">
          <h1>
            Show what is happening <span className="accent">nearby.</span>
          </h1>
          <p className="lede">
            A simple way for communities to document completed activities, even when the connection
            drops. Photos and a few short answers, no account, no personal data.
          </p>
          <div className="cta-row">
            <Link className="btn" href={`/verify/${SAMPLE_HASH}`}>
              See a sample report
            </Link>
            <Link className="btn secondary" href="/dashboard">
              Open the stakeholder dashboard
            </Link>
          </div>
        </div>

        <aside className="payload card" aria-label="What a report carries">
          <p
            className="faint"
            style={{ margin: 0, fontSize: "0.8rem", letterSpacing: "0.04em", textTransform: "uppercase" }}
          >
            What a report carries
          </p>
          <ul className="payload-list">
            <li>
              <strong>The activity</strong>
              <span className="muted">which field task was done</span>
            </li>
            <li>
              <strong>An approximate area</strong>
              <span className="muted">a coarse region, never an exact location</span>
            </li>
            <li>
              <strong>The capture time</strong>
              <span className="muted">when the photo was taken</span>
            </li>
            <li>
              <strong>A public reference</strong>
              <span className="muted">so anyone can check the report later</span>
            </li>
          </ul>
          <p className="faint" style={{ margin: 0, fontSize: "0.85rem" }}>
            No photo, no name, and no exact location leaves the phone with the report.
          </p>
        </aside>
      </div>

      <h2 id="how-it-works">How it works</h2>
      <div className="steps">
        <div className="step">
          <span className="n" aria-hidden>
            1
          </span>
          <h3>Capture offline</h3>
          <p>
            A community reporter photographs the completed work and answers a couple of short
            questions. No signal needed.
          </p>
        </div>
        <div className="step">
          <span className="n" aria-hidden>
            2
          </span>
          <h3>Send when there is signal</h3>
          <p>
            The report waits safely on the phone and sends itself once a connection returns. Nothing
            is lost.
          </p>
        </div>
        <div className="step">
          <span className="n" aria-hidden>
            3
          </span>
          <h3>Confirm and review</h3>
          <p>
            The programme team reviews the report. When another community member reports the same
            activity, it is marked confirmed.
          </p>
        </div>
      </div>

      <h2>Privacy, in plain language</h2>
      <ul className="plain">
        <li>A report never includes the reporter&apos;s name, phone number, or any identity document.</li>
        <li>Only an approximate area is shared, never the exact spot.</li>
        <li>The original photo stays on the reporter&apos;s phone unless they choose to share it.</li>
        <li>Anyone can open a report&apos;s status page with no account and no login.</li>
      </ul>

      <h2>Open source, honest about status</h2>
      <p className="muted">
        Prufture is an open prototype built for a hackathon. It is not a UNICEF product and carries
        no endorsement or deployment. The device key is kept in the phone&apos;s operating system
        secure store. Hardware attestation and an on-device zero-knowledge identity proof are named
        next steps, not current guarantees.
      </p>
      <p className="faint" style={{ fontSize: "0.9rem" }}>
        Check any shared report at <code>/verify/&lt;reference&gt;</code>. Programme staff use the{" "}
        <Link href="/dashboard">dashboard</Link>.
      </p>
    </main>
  );
}
