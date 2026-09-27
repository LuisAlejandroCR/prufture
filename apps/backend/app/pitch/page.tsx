// page.tsx: the public /pitch route — a 6-slide deck built server-side and paged by Deck.tsx. Slides
// 4-6 carry QR codes to the app, dashboard, a real proof and the repo. Content tracks docs/verification.md
// and docs/location_privacy.md; unknowns render as visible "TBD:" chips or QR placeholders.

import { Fragment } from "react";
import Deck from "./Deck";
import QrCard from "./QrCard";

export const metadata = {
  title: "Prufture — pitch",
  description: "Proof at capture: the pitch for the FIRSTBLOCK-ATHON submission.",
};

// Known on-chain evidence (docs/verification.md, "Real EAS attestation on Base Sepolia").
const TX_HASH = "0xee879341dbb965363bf37e1c3c8b56af8fdc732902ff3f736e6389d6b0994a9b";
const ATTESTATION_UID = "0x4798879a555b6442a876a9b9a9dacfd7c3a73c3bd7fb3978f492b0fd72522905";
const EASSCAN_TX = `https://base-sepolia.easscan.org/attestation/view/${ATTESTATION_UID}`;

// Deploy-time wiring. DASHBOARD_URL / VERIFY_URL resolve from NEXT_PUBLIC_VERIFY_BASE_URL
// (the same env var the /verify route reads) when Vercel sets it; until then each renders
// as a labelled QR placeholder. REPO_URL is a constant. APP_URL stays null — the demo runs
// in Expo Go and the exp:// link is pasted by the human at demo time.
const DEPLOY_BASE: string | null =
  process.env.NEXT_PUBLIC_VERIFY_BASE_URL?.replace(/\/+$/, "") || null;
// Sample proof for /verify — hashBytes("seed: solar panel installation|solar-panel-install"),
// the first row apps/api/scripts/seed.ts writes to a fresh deploy.
const SAMPLE_HASH = "992f8d6232210e99a6ed60a9c23dc22b3a304cd0c0d13bbdecf16f3c573d5d75";

const APP_URL: string | null = null; // Expo Go project link (exp://) — the demo runs in Expo Go
const DASHBOARD_URL: string | null = DEPLOY_BASE ? `${DEPLOY_BASE}/dashboard` : null;
const VERIFY_URL: string | null = DEPLOY_BASE ? `${DEPLOY_BASE}/verify/${SAMPLE_HASH}` : null;
const REPO_URL: string | null = "https://github.com/LuisAlejandroCR/unicef-firstblockathon";

const slideBodies: React.ReactNode[] = [
  // 1 — title + context
  <>
    <p className="pitch-kicker">FIRSTBLOCK-ATHON · UNICEF #1</p>
    <h1>Prufture / proof at capture</h1>
    <p className="pitch-lead">
      A volunteer photographs field evidence offline. It reaches the organisation signed,
      located to a coarse area, and with zero personal data.
    </p>
    <ul>
      <li>
        Field programmes run where coverage doesn&rsquo;t &mdash;{" "}
        <span className="m">volunteers verify field tasks with no signal at the moment it matters</span>.
      </li>
      <li className="m">
        U-Report is the first channel; the engine fits any field-verification programme.
      </li>
      <li className="m">Luis Alejandro C&aacute;rdenas &mdash; solo founder / builder</li>
    </ul>
  </>,

  // 2 — problem
  <>
    <p className="pitch-kicker">The problem</p>
    <h2>Everyone in the chain pays for the gap.</h2>
    <ul>
      <li>
        Today the proof is a photo in a chat app:{" "}
        <span className="m">trustable only if you trust the sender, and it carries their identity</span>.
      </li>
      <li>
        <b>The volunteer</b> &mdash; identified to be believed, or asked for data that puts them at risk.
      </li>
      <li>
        <b>The programme</b> &mdash; can&rsquo;t tell a real installation from a stock photo.
      </li>
      <li>
        <b>The donor</b> &mdash; no independent record that the work happened.
      </li>
    </ul>
  </>,

  // 3 — solution
  <>
    <p className="pitch-kicker">Prufture</p>
    <h2>Four fields leave the device. Nothing else.</h2>
    <pre className="pitch-payload">
      {`on-chain payload
  proofHash   sha256 of the photo bytes
  taskId      "solar-panel-installation"
  zone        ~5-char geohash cell, ~2.4 km
  date        the capture day`}
    </pre>
    <div className="pitch-pipe">
      <span>capture</span>
      <i>&rsaquo;</i>
      <span>sign</span>
      <i>&rsaquo;</i>
      <span>queue offline</span>
      <i>&rsaquo;</i>
      <span>sync</span>
      <i>&rsaquo;</i>
      <span>EAS attest()</span>
      <i>&rsaquo;</i>
      <span>WhatsApp verifyUrl</span>
    </div>
    <ul>
      <li>
        <span className="m">
          The public and the chain see a ~2.4 km zone. The precise point is encrypted on the
          device to the programme team&rsquo;s key &mdash; never published, never on-chain.
        </span>
      </li>
    </ul>
  </>,

  // 4 — try the app
  <>
    <p className="pitch-kicker">Demo &mdash; the app</p>
    <h2>Open it in Expo Go.</h2>
    <div className="pitch-qr-row">
      <QrCard url={APP_URL} label="Scan with Expo Go" caption="Expo Go project link (exp://)" />
      <ul>
        <li>Permissions &mdash; camera and approximate area, each with its reason.</li>
        <li>In airplane mode: take the photo, answer two short questions.</li>
        <li>&ldquo;Saved on this phone&rdquo; &mdash; hashed and signed on the device.</li>
        <li>Signal returns &rarr; the queue sends itself.</li>
        <li className="m">No account. No name. No exact location.</li>
      </ul>
    </div>
  </>,

  // 5 — dashboard + a real proof
  <>
    <p className="pitch-kicker">Demo &mdash; verification</p>
    <h2>It&rsquo;s real, and it&rsquo;s checkable.</h2>
    <div className="pitch-qr-row">
      <QrCard url={DASHBOARD_URL} label="Programme dashboard" caption="deploy URL /dashboard" />
      <QrCard url={VERIFY_URL} label="A public proof" caption="deploy URL /verify/<hash>" />
    </div>
    <ul>
      <li>
        Live attestation on Base Sepolia, EAS schema #2438 &mdash; decode shows only the four
        public fields.
      </li>
      <li className="pitch-links">
        <a href={EASSCAN_TX} target="_blank" rel="noreferrer">
          {EASSCAN_TX}
        </a>
      </li>
    </ul>
  </>,

  // 6 — scope, next steps, the call
  <>
    <p className="pitch-kicker">Scope &amp; the call</p>
    <h2>What runs today &mdash; and the ask.</h2>
    <div className="pitch-cols">
      <div>
        <h3 className="accent">Runs today</h3>
        <ul>
          <li>Offline capture, hash, sign, queue</li>
          <li>Client sync + real on-chain attestation ({TX_HASH.slice(0, 10)}&hellip;)</li>
          <li>Public /verify and /dashboard, WhatsApp delivery (Kapso)</li>
          <li>Honest degradation on every external call</li>
        </ul>
      </div>
      <div>
        <h3>Next steps &mdash; not built</h3>
        <ul>
          <li>Signed personhood + precise-location commitment on-chain (schema v2)</li>
          <li>Selfie-liveness boolean (in integration); a real liveness vendor</li>
          <li>A ZK unlinkability layer; email channel; EAS store build</li>
        </ul>
      </div>
    </div>
    <div className="pitch-qr-row">
      <QrCard url={REPO_URL} label="Source" caption="repo URL" />
      <ul>
        <li>
          No zero-knowledge, no TEE, no hardware attestation, no &ldquo;deepfake-proof&rdquo; claim.
        </li>
        {/* HUMAN: confirm Go/Pivot/Stop */}
        <li>
          <b>Go</b> &mdash; the offline capture &rarr; on-device sign &rarr; queue &rarr; sync
          &rarr; real EAS attestation path runs end to end today on Base Sepolia, 157 tests
          green, zero PII in the on-chain decode; what remains is integration and pilot
          pre-conditions, not unproven core mechanics.
        </li>
      </ul>
    </div>
  </>,
];

const slides: React.ReactNode[] = slideBodies.map((body, k) => (
  <Fragment key={k}>{body}</Fragment>
));

export default function PitchPage() {
  return <Deck slides={slides} />;
}
