// page.tsx: the public /pitch route — 9 pitch slides on the same Vercel domain as
// /dashboard and /verify. Server component: it builds the slide content and hands it to
// Deck.tsx for paging. Content is the deck from docs/slides.html, refreshed to the real
// current status (see docs/verification.md, docs/location_privacy.md, docs/video_script.md).
// No login, no product logic. [[ ]] placeholders render as visible "TBD:" chips.

import { Fragment } from "react";
import Link from "next/link";
import Deck from "./Deck";

export const metadata = {
  title: "Prufture — pitch",
  description: "Proof at capture: the 9-slide pitch for the FIRSTBLOCK-ATHON submission.",
};

const TX_HASH = "0xee879341dbb965363bf37e1c3c8b56af8fdc732902ff3f736e6389d6b0994a9b";
const ATTESTATION_UID = "0x4798879a555b6442a876a9b9a9dacfd7c3a73c3bd7fb3978f492b0fd72522905";
const EASSCAN_TX = `https://base-sepolia.easscan.org/attestation/view/${ATTESTATION_UID}`;

function Tbd({ children }: { children: React.ReactNode }) {
  return <span className="pitch-tbd">TBD: {children}</span>;
}

const slideBodies: React.ReactNode[] = [
  // 1 — title
  <>
    <p className="pitch-kicker">FIRSTBLOCK-ATHON · UNICEF #1</p>
    <h1>Prufture / proof at capture</h1>
    <p className="pitch-lead">
      A volunteer photographs field evidence offline. It reaches the organisation signed,
      located to a coarse area, and with zero personal data.
    </p>
    <p>
      <Tbd>team names</Tbd> · <Tbd>repo URL</Tbd>
    </p>
  </>,

  // 2 — problem
  <>
    <p className="pitch-kicker">The problem</p>
    <h2>U-Report runs where coverage doesn&rsquo;t.</h2>
    <ul>
      <li>
        Volunteers verify field tasks &mdash; a solar panel installed, a pump repaired &mdash;
        often with <span className="m">no signal at the moment it matters</span>.
      </li>
      <li>
        Today the proof is a photo in a chat app:{" "}
        <span className="m">trustable only if you trust the sender, and it carries their identity</span>.
      </li>
      <li>
        So the organisation either takes it on faith or asks for data that{" "}
        <span className="m">puts the volunteer at risk</span>.
      </li>
    </ul>
  </>,

  // 3 — who it hurts
  <>
    <p className="pitch-kicker">Who it hurts</p>
    <h2>Everyone in the chain pays for the gap.</h2>
    <ul>
      <li>
        <b>The volunteer</b> &mdash; identified to be believed.
      </li>
      <li>
        <b>The programme</b> &mdash; can&rsquo;t tell a real installation from a stock photo.
      </li>
      <li>
        <b>The donor</b> &mdash; no independent record that the work happened.
      </li>
    </ul>
  </>,

  // 4 — the guarantee
  <>
    <p className="pitch-kicker">The guarantee</p>
    <h2>Four fields leave the device. Nothing else.</h2>
    <pre className="pitch-payload">
      {`on-chain payload
  proofHash   sha256 of the photo bytes
  taskId      "solar-panel-installation"
  zone        ~5-char geohash cell, ~2.4 km
  date        the capture day`}
    </pre>
    <ul>
      <li>
        <span className="m">
          The public and the chain see a ~2.4 km zone &mdash; a village, not a person or a house.
        </span>
      </li>
      <li>
        <span className="m">
          The precise point is encrypted on the device to the programme team&rsquo;s key. It is
          never published and never put on-chain; only the programme team can decrypt it, for audit.
        </span>
      </li>
      <li>
        <span className="m">No photo. No name. No account. The private key never leaves the OS secure store.</span>
      </li>
    </ul>
  </>,

  // 5 — how it works
  <>
    <p className="pitch-kicker">How it works</p>
    <h2>One vertical path, offline-first.</h2>
    <div className="pitch-pipe">
      <span>capture photo + GPS + time</span>
      <i>&rsaquo;</i>
      <span>sha256 + ed25519 sign</span>
      <i>&rsaquo;</i>
      <span>SQLite queue &mdash; pending</span>
      <i>&rsaquo;</i>
      <span>sync when signal returns</span>
      <i>&rsaquo;</i>
      <span>backend verifies + EAS attest()</span>
      <i>&rsaquo;</i>
      <span>public /verify</span>
      <i>&rsaquo;</i>
      <span>verifyUrl by WhatsApp</span>
    </div>
    <ul>
      <li>
        <span className="m">
          Every external call degrades to a typed result &mdash; the offline capture never breaks.
        </span>
      </li>
    </ul>
  </>,

  // 6 — honest scope
  <>
    <p className="pitch-kicker">Honest scope</p>
    <h2>What runs today &mdash; and what is a next step.</h2>
    <div className="pitch-cols">
      <div>
        <h3 className="accent">Runs today</h3>
        <ul>
          <li>Offline capture, hash, sign, queue</li>
          <li>Client sync + real on-chain attestation ({TX_HASH.slice(0, 10)}&hellip;)</li>
          <li>Public /verify and /dashboard, no login</li>
          <li>WhatsApp delivery (Kapso) &mdash; verifyUrl only</li>
          <li>Honest degradation on every external call</li>
        </ul>
      </div>
      <div>
        <h3>Next steps &mdash; not built</h3>
        <ul>
          <li>Signed personhood + precise-location commitment on-chain (schema v2)</li>
          <li>Selfie-liveness boolean &mdash; in integration, not yet on main</li>
          <li>A real liveness vendor / AWS; a ZK unlinkability layer</li>
          <li>Email channel; EAS store build</li>
        </ul>
      </div>
    </div>
    <p className="faint">No zero-knowledge, no TEE, no hardware attestation, no &ldquo;deepfake-proof&rdquo; claim.</p>
  </>,

  // 7 — it's checkable
  <>
    <p className="pitch-kicker">Evidence</p>
    <h2>It&rsquo;s real, and it&rsquo;s checkable.</h2>
    <ul>
      <li>
        Live attestation on Base Sepolia, EAS schema #2438{" "}
        <span className="m">(bytes32 proofHash, string taskId, string geohash, uint64 capturedAt)</span>.
      </li>
      <li>
        Decode the calldata &mdash; it shows only the four public fields. No signature, no key,
        no coordinates, no volunteer identifier.
      </li>
    </ul>
    <p className="pitch-links">
      <a href={EASSCAN_TX} target="_blank" rel="noreferrer">
        {EASSCAN_TX}
      </a>
    </p>
  </>,

  // 8 — evidence / links
  <>
    <p className="pitch-kicker">Links</p>
    <h2>See it for yourself.</h2>
    <div className="pitch-links">
      <span>
        Deploy: <Tbd>deploy URL</Tbd>
      </span>
      <span>
        Repo: <Tbd>repo URL</Tbd>
      </span>
      <span>
        Sample report: <Tbd>domain</Tbd>/verify/<Tbd>hash</Tbd>
      </span>
      <span>Attestation tx:</span>
      <a href={EASSCAN_TX} target="_blank" rel="noreferrer">
        {TX_HASH}
      </a>
    </div>
  </>,

  // 9 — the call
  <>
    <p className="pitch-kicker">The call</p>
    <h2>Go / Pivot / Stop.</h2>
    <ul>
      <li>
        <b>Opportunity</b> &mdash; several FIRSTBLOCK statements ask for offline, no-PII field
        capture. Prufture is the reusable answer, not a one-off.
      </li>
      <li>
        <b>Evidence</b> &mdash; the vertical path runs end to end today, on testnet, with tests.
      </li>
      <li>
        <b>Venture shape</b> &mdash; infrastructure for any NGO that collects field proof;
        U-Report is the first channel.
      </li>
      <li>
        <b>Decision</b> &mdash; <Tbd>the team&rsquo;s call + one line of why</Tbd>
      </li>
    </ul>
    <p>
      <Tbd>team names</Tbd>
    </p>
  </>,
];

const slides: React.ReactNode[] = slideBodies.map((body, k) => (
  <Fragment key={k}>{body}</Fragment>
));

export default function PitchPage() {
  return <Deck slides={slides} />;
}
