// page.tsx: landing — the guarantee, one asymmetric hero, links to the explainer section and the dashboard.
// Presentation only. The claims here must stay true to what the code does (no ZK / TEE / GDPR claim).

import Link from "next/link";

export default function Home() {
  return (
    <section>
      <div className="hero">
        <div className="hero-copy">
          <h1>
            Proof from the field,
            <br />
            <span className="accent">without the person attached.</span>
          </h1>
          <p className="lede">
            A volunteer photographs an installed asset offline. The proof reaches the organization
            signed, tied to a coarse area, and carrying zero personal data.
          </p>
          <div className="cta-row">
            <Link className="btn" href="#how-it-holds-up">
              How verification works
            </Link>
            <Link className="btn secondary" href="/dashboard">
              Open the dashboard
            </Link>
          </div>
        </div>

        <aside className="payload card" aria-label="What is made public">
          <p className="faint" style={{ margin: 0, fontSize: "0.8rem", letterSpacing: "0.04em", textTransform: "uppercase" }}>
            Everything that goes public
          </p>
          <ul className="payload-list">
            <li>
              <code>proofHash</code>
              <span className="muted">sha256 of the photo bytes</span>
            </li>
            <li>
              <code>taskId</code>
              <span className="muted">which field task, not who</span>
            </li>
            <li>
              <code>geohash</code>
              <span className="muted">a coarse area, never GPS</span>
            </li>
            <li>
              <code>capturedAt</code>
              <span className="muted">capture time, UTC</span>
            </li>
          </ul>
          <p className="faint" style={{ margin: 0, fontSize: "0.85rem" }}>
            No photo, no name, no exact location leaves the device.
          </p>
        </aside>
      </div>

      <h2 id="how-it-holds-up">How it holds up</h2>
      <ul className="plain">
        <li>Capture, hash and signing run on the device with the radio off.</li>
        <li>The hash is anchored on Base Sepolia through the Ethereum Attestation Service.</li>
        <li>A second reviewer can attest the same hash, so verification has more than one witness.</li>
        <li>Anyone can check a proof at its link with no account.</li>
      </ul>

      <p className="faint" style={{ fontSize: "0.85rem" }}>
        The device key lives in the operating system secure store. Hardware attestation and an
        on-device zero-knowledge age proof are named next steps, not current guarantees.
      </p>
    </section>
  );
}
