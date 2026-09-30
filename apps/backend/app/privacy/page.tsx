// page.tsx: public /privacy — the privacy policy URL for App Store Connect and Google Play. Every
// statement must match what the code does (docs/location_privacy.md, docs/legal_posture.md).
// HONESTY RULE: describe the mechanism; never claim a certification or guarantee we do not hold.

import Link from "next/link";
import { SiteFooter, SiteHeader } from "../_components/brand";

export const metadata = {
  title: "Privacy — Prufture",
  description: "What Prufture collects, what leaves your phone, and what is permanent.",
};

const UPDATED = "30 September 2026";

export default function PrivacyPage() {
  return (
    <div className="site">
      <SiteHeader />
      <main className="site-body narrow prose fade-in">
        <p className="eyebrow-label">Policy</p>

        <h1>Privacy</h1>
        <p className="lede">
          Prufture is designed so that a report can be trusted without knowing who sent it. This page
          describes what actually happens to your data, including the parts that cannot be undone.
        </p>
        <p className="faint">Last updated: {UPDATED}</p>

        <h2>In short</h2>
        <ul>
          <li>You do not create an account. We never ask for your name, email, phone number or ID.</li>
          <li>Your photo stays on your phone. We upload a fingerprint of it, not the picture.</li>
          <li>Only an approximate area is published — never your exact position.</li>
          <li>
            A small, fixed set of non-personal fields is written to a public blockchain, where it is{" "}
            <strong>permanent and cannot be deleted by anyone, including us</strong>.
          </li>
        </ul>

        <h2>What leaves your phone when you send a report</h2>
        <p>Exactly four pieces of information, plus a signature proving they came from your device:</p>
        <dl className="fields">
          <dt>Photo fingerprint</dt>
          <dd>
            A SHA-256 hash of the photo — a one-way fingerprint. The image itself is never uploaded by
            the app. The fingerprint cannot be turned back into the picture.
          </dd>
          <dt>Activity</dt>
          <dd>Which field activity you are reporting on. Not linked to a person.</dd>
          <dt>Approximate area</dt>
          <dd>
            A 5-character geographic cell, roughly a few kilometres across. This is the only location
            that is signed or published. See “Location” below.
          </dd>
          <dt>Capture time</dt>
          <dd>When the photo was taken.</dd>
          <dt>Device signature</dt>
          <dd>
            A digital signature and its matching public key, created by a private key generated on your
            phone and held in the operating system’s secure storage (iOS Keychain / Android Keystore).
            The key never leaves the device and is not linked to your identity.
          </dd>
        </dl>

        <h2>What stays on your phone</h2>
        <ul>
          <li>The photo itself.</li>
          <li>The private signing key.</li>
          <li>Your queue of reports, including any not yet sent.</li>
        </ul>
        <p>
          Deleting the app removes all of these from your device. Reports already sent cannot be
          recalled — see “What is permanent”.
        </p>

        <h2>Location</h2>
        <p>
          Location is required to submit a report, because a report about a place is not useful without
          one. Two different things happen to it, and the difference matters:
        </p>
        <ul>
          <li>
            <strong>The approximate area</strong> — a coarse cell of roughly a few kilometres — is the
            only location that is signed, published, or written to the blockchain. It is shown on the
            public verification page.
          </li>
          <li>
            <strong>The precise point</strong> is encrypted on your phone to the programme team’s key
            before it is sent. It is stored as an unreadable blob. It is never published, never written
            to the blockchain, and the servers that hold it cannot open it. Only a holder of the
            programme team’s private key can, for audit purposes.
          </li>
        </ul>

        <h2>What is permanent</h2>
        <p>
          When a report is confirmed, the photo fingerprint, activity, approximate area and capture time
          are written to a public blockchain (Base). This is what makes a report independently checkable
          later. It also means:
        </p>
        <ul>
          <li>That record is public and readable by anyone.</li>
          <li>
            It <strong>cannot be edited or deleted</strong> — not by you, not by the programme team, not
            by us. No deletion request can remove it, because no one controls the network.
          </li>
          <li>
            This is why no personal data is ever put there. The four fields above are all that is
            written.
          </li>
        </ul>

        <h2>Face check</h2>
        <p>
          Prufture has an optional live-person face check, which is <strong>switched off</strong> in the
          current app and is never required to send a report. Nothing in this section happens unless a
          programme switches it on and you choose to take the check.
        </p>
        <p>
          It asks only one question: was a live person in front of the camera? It does not identify
          you, match your face against anyone, or prove that you are a unique person.
        </p>
        <ul>
          <li>
            <strong>Processed by Amazon Web Services.</strong> During the check, a short video of your
            face is streamed from the app to AWS (Amazon Rekognition Face Liveness), which analyses it
            on our behalf and returns a result to our server.
          </li>
          <li>
            <strong>No face image is stored.</strong> We set up the check so AWS writes no images to
            storage and returns no audit images. AWS’s answer can still include a single still frame;
            our server reads only the pass/fail result and the confidence score from that answer and
            discards the rest in memory, without storing, logging or forwarding any image. No image of
            your face ever reaches the app, our database, the public verification page or the
            blockchain.
          </li>
          <li>
            <strong>Only a yes/no is kept.</strong> From the check, Prufture keeps one pass/fail value.
            If you pass, your phone keeps a signed receipt (a pass/fail value and a time, no image) for
            up to 30 days, and each report you send in that time is marked “verified person: yes”. A
            failed or unfinished check keeps nothing.
          </li>
          <li>
            No face template or other biometric identifier is created or kept by Prufture, and nothing
            from the check is written to the blockchain.
          </li>
        </ul>
        <p>
          An older selfie step is also switched off by default and is not part of the standard
          reporting flow. Where it is switched on, a few camera frames are sent once to our server to
          produce the same yes/no answer and are not stored.
        </p>

        <h2>Notifications</h2>
        <p>
          If you allow notifications, the app registers a push token against a randomly generated device
          identifier. It is not connected to your name, phone number or report history.
        </p>

        <h2>Subscriptions</h2>
        <p>
          Reporting is free and always will be. A paid subscription exists only for programme
          coordinators and organisations reviewing reports. Purchases are processed by Apple or Google
          and managed through RevenueCat; we receive a subscription status against an anonymous
          identifier. We never receive your card details. We do not require an email address to
          subscribe.
        </p>

        <h2>What we do not do</h2>
        <ul>
          <li>No advertising, no ad identifiers, no third-party analytics or tracking SDKs.</li>
          <li>We do not sell or share personal data, because we do not collect it.</li>
          <li>We do not upload your photo library. The app cannot read it.</li>
          <li>We do not record audio.</li>
        </ul>

        <h2>Your choices</h2>
        <p>
          You can withdraw camera, location or notification permission at any time in your device
          settings; the app will stop being able to create new reports. Deleting the app erases the
          on-device data listed above. Because reports carry no identifier for you, we cannot locate
          “your” reports in order to delete them on request — and the blockchain records cannot be
          deleted by anyone in any case. This is a deliberate trade-off: it is the same property that
          stops anyone linking a report back to you.
        </p>

        <h2>Children</h2>
        <p>
          Prufture is intended for adults taking part in a field programme. It is not directed at
          children and we do not knowingly collect data from them.
        </p>

        <h2>Status of this software</h2>
        <p>
          Prufture is an independent prototype, built in response to a challenge presented by UNICEF at
          a hackathon. It is not a UNICEF product and carries no UNICEF endorsement, partnership or
          adoption. Data is currently written to a test network.
        </p>

        <h2>Contact</h2>
        <p>
          Questions about this policy: see the <Link href="/support">support page</Link>.
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
