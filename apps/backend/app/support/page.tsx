// page.tsx: public /support — the support URL for App Store Connect and Google Play, answering what
// reporters and coordinators actually ask. The contact comes from NEXT_PUBLIC_SUPPORT_EMAIL and
// NEXT_PUBLIC_SUPPORT_WHATSAPP; if both are unset
// the page says so rather than printing a fake address (a dead support link fails app review).

import Link from "next/link";
import { SiteFooter, SiteHeader } from "../_components/brand";

export const metadata = {
  title: "Support — Prufture",
  description: "Help with reporting, verification and subscriptions.",
};

const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "";
// International number, e.g. +57 301 393 5156; wa.me wants digits only.
const SUPPORT_WHATSAPP = process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP ?? "";
const WHATSAPP_DIGITS = SUPPORT_WHATSAPP.replace(/D/g, "");

function Contact() {
  if (!SUPPORT_EMAIL && !WHATSAPP_DIGITS) {
    return (
      <p className="muted">
        A support address is being set up for this release. Until it is live, please reach the
        programme team through the organisation that invited you to the pilot.
      </p>
    );
  }
  return (
    <p>
      {WHATSAPP_DIGITS ? (
        <>
          WhatsApp <a href={`https://wa.me/${WHATSAPP_DIGITS}`}>{SUPPORT_WHATSAPP}</a>
          {SUPPORT_EMAIL ? " or e" : "."}
        </>
      ) : (
        "E"
      )}
      {SUPPORT_EMAIL ? (
        <>
          mail <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
        </>
      ) : null}{" "}
      Please say which screen you were on and what you expected to happen. Do not include personal
      details of anyone in a report.
    </p>
  );
}

export default function SupportPage() {
  return (
    <div className="site">
      <SiteHeader />
      <main className="site-body narrow prose fade-in">
        <p className="eyebrow-label">Help centre</p>

        <h1>Support</h1>
        <p className="lede">
          Prufture lets someone photograph what happened in the field and have that report checked
          later, without giving up anything about themselves.
        </p>

        <h2>Contact</h2>
        <Contact />

        <h2>Reporting</h2>

        <h3>I have no signal. Can I still report?</h3>
        <p>
          Yes. Capturing, signing and saving a report all work fully offline — that is the point. The
          report waits in your queue and sends itself when you next have a connection. You do not need
          to keep the app open.
        </p>

        <h3>My report still says it is waiting to send.</h3>
        <p>
          It is safe on the device. Reports send on their own when a connection returns; you can also
          trigger it from the home screen. Nothing is lost by closing the app.
        </p>

        <h3>Why does it insist on location?</h3>
        <p>
          A report about a place cannot be checked without one. Only an approximate area — a few
          kilometres across — is ever published. Your exact position is encrypted on the phone and is
          not readable by the servers that store it. See <Link href="/privacy">privacy</Link>.
        </p>

        <h3>Can I delete a report I already sent?</h3>
        <p>
          No, and we want to be direct about why. A sent report carries no identifier for you, so we
          cannot find “your” reports; and confirmed reports are written to a public blockchain, which no
          one can edit or delete. The same property that makes a report trustworthy later is what makes
          it permanent.
        </p>

        <h3>Do I need an account?</h3>
        <p>No. There is no sign-up, no password, and no email address.</p>

        <h3>Does reporting cost anything?</h3>
        <p>
          No. Creating, saving, sending and checking reports is free and stays free. The paid plan is
          for programme coordinators reviewing many reports.
        </p>

        <h2>Checking a report</h2>

        <h3>Someone sent me a link. What am I looking at?</h3>
        <p>
          A public record page. It shows the activity, an approximate area, the date, and how many
          community members have reported the same thing. It needs no login and shows nothing about who
          reported it.
        </p>

        <h3>The page says the report was not found.</h3>
        <p>
          Either the link is incomplete, or the report has not finished sending yet. Check the whole
          link was copied, then try again shortly.
        </p>

        <h2>Subscriptions</h2>

        <h3>What does the coordinator plan include?</h3>
        <p>
          Review tools for programme teams: the report list with review status, recording an accepted or
          rejected verdict, and data export. Reporters never see a paywall.
        </p>

        <h3>Where do I find it?</h3>
        <p>
          In the app, open Me, then Coordinator review. Without a plan it shows what the plan includes
          and a See plans button with the monthly and annual prices.
        </p>

        <h3>How do I cancel or get a refund?</h3>
        <p>
          Subscriptions are billed by Apple or Google, so cancellation and refunds are handled there —
          on iOS in Settings → your name → Subscriptions, on Android in Google Play → Subscriptions. We
          cannot cancel or refund on your behalf.
        </p>

        <h3>I paid but the review tools are still locked.</h3>
        <p>
          Open Me, then Coordinator review, then See plans, and tap Restore purchases. If it stays locked, the entitlement check may
          be temporarily unreachable — the app deliberately keeps the tools locked rather than guessing.
          Try again shortly, and contact us if it persists.
        </p>

        <h2>About this software</h2>
        <p>
          Prufture is an independent prototype, built in response to a challenge presented by UNICEF at
          a hackathon. It is not a UNICEF product and carries no UNICEF endorsement, partnership or
          adoption. Reports are currently written to a test network.
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
