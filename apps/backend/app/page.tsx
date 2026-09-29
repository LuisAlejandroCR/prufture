// page.tsx: cinematic public landing for judges, partners and community organizations
// (not the reporter workflow), in an editorial product-theater rhythm with scroll films.
// Every claim must stay true to the code: no ZK, TEE or deployment claim.

import Link from "next/link";
import { qrPath } from "./pitch/qr";
import { ScrollFilms } from "./ScrollFilms";
import { HeroPhone } from "./HeroPhone";

const SAMPLE_HASH =
  process.env.NEXT_PUBLIC_SAMPLE_HASH ??
  "992f8d6232210e99a6ed60a9c23dc22b3a304cd0c0d13bbdecf16f3c573d5d75";

const ANDROID_BUILD_URL =
  process.env.NEXT_PUBLIC_ANDROID_BUILD_URL ??
  "https://expo.dev/accounts/alejoo_oo/projects/prufture/builds/4bb39156-6542-44af-b2f8-1976cc90e47d";

function Mark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="landing-mark" aria-label="Prufture">
      <img className="landing-icon" src="/media/prufture-icon.png" alt="" aria-hidden="true" />
      {!compact && <span>Prufture</span>}
    </span>
  );
}

function ArrowIcon() {
  return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10h11M11 6l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.8" /></svg>;
}

function CheckIcon() {
  return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m4 10 4 4 8-9" fill="none" stroke="currentColor" strokeWidth="2" /></svg>;
}

function SignalIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 15.5a10 10 0 0 1 14 0M8.5 19a5 5 0 0 1 7 0M2 12a15 15 0 0 1 20 0" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>;
}

function ProductPreview() {
  return (
    <div className="product-stage" aria-label="Prufture report preview">
      <div className="stage-glow" aria-hidden="true" />
      <div className="signal-card glass-card float-one">
        <span className="signal-icon"><SignalIcon /></span>
        <span><strong>Works offline</strong><small>Ready when signal returns</small></span>
      </div>
      <div className="confirm-card glass-card float-two">
        <span className="mini-check"><CheckIcon /></span>
        <span><strong>Report confirmed</strong><small>2 community confirmations</small></span>
      </div>
      <div className="phone" aria-hidden="true">
        <div className="phone-bezel">
          <HeroPhone />
        </div>
      </div>
      <div className="privacy-chip glass-card float-three"><span className="privacy-dot" /> No personal data</div>
    </div>
  );
}

export default function Home() {
  const { size, path } = qrPath(ANDROID_BUILD_URL);
  return (
    <main className="landing">
      <nav className="landing-nav" aria-label="Primary navigation">
        <Link className="brand-link" href="/"><Mark /></Link>
        <div className="nav-links"><a href="#how">How it works</a><a href="#privacy">Privacy</a><Link href="/dashboard">Dashboard</Link></div>
        <Link className="nav-action" href={`/verify/${SAMPLE_HASH}`}>View a report</Link>
      </nav>

      <section className="landing-hero">
        <div className="hero-orb hero-orb-blue" aria-hidden="true" /><div className="hero-orb hero-orb-green" aria-hidden="true" />
        <div className="hero-message">
          <p className="eyebrow"><span /> Evidence that moves at the speed of trust</p>
          <h1>Proof from the field.<br /><em>Ready for the world.</em></h1>
          <p className="hero-lede">Communities document completed work without signal, accounts, or personal data. Prufture keeps every report clear, private, and ready to verify.</p>
          <div className="hero-actions">
            <Link className="landing-btn landing-btn-primary" href={`/verify/${SAMPLE_HASH}`}>Explore a real report <ArrowIcon /></Link>
            <a className="landing-btn landing-btn-ghost" href="#how">See how it works</a>
          </div>
          <div className="trust-row" aria-label="Product qualities"><span><CheckIcon /> Offline first</span><span><CheckIcon /> No account</span><span><CheckIcon /> Publicly checkable</span></div>
        </div>
        <ProductPreview />
        <a className="scroll-cue" href="#story" aria-label="Scroll to learn more"><span>Scroll to discover</span><i aria-hidden="true" /></a>
      </section>

      <section className="proof-strip" aria-label="Prufture principles"><div><span>OFFLINE CAPTURE</span><i>●</i><span>PRIVATE BY DESIGN</span><i>●</i><span>COMMUNITY CONFIRMED</span><i>●</i><span>OPEN VERIFICATION</span><i>●</i></div></section>

      <section className="story-section" id="story">
        <div className="section-index">01 / THE MISSION</div>
        <div className="story-grid">
          <h2>When the network disappears,<br /><em>the work does not.</em></h2>
          <div className="story-copy"><p>Vital community work often happens far from reliable connectivity. Prufture lets a reporter capture the moment now and safely send it later.</p><p>The result is a simple public record of what happened, where approximately, and when — without publishing who the reporter is or the exact place they stood.</p></div>
        </div>
        <div className="impact-row"><article><strong>0</strong><span>personal details required</span></article><article><strong>5</strong><span>characters of approximate area</span></article><article><strong>24/7</strong><span>public report checking</span></article></div>
      </section>

      <section className="process-section" id="how">
        <div className="section-heading light-heading"><div className="section-index">02 / THE JOURNEY</div><h2>Four quiet steps.<br /><em>One trusted record.</em></h2></div>
        <ScrollFilms />
        <p className="swipe-note">Each step plays as you reach it — low signal, small screens, high stakes.</p>
      </section>

      <section className="privacy-section" id="privacy">
        <div className="privacy-visual" aria-hidden="true">
          <div className="privacy-rings"><span /><span /><span /></div><div className="privacy-core"><Mark compact /><strong>Yours stays yours.</strong></div>
          <span className="orbit-label orbit-name">No name</span><span className="orbit-label orbit-photo">Photo stays local</span><span className="orbit-label orbit-location">Approximate area only</span>
        </div>
        <div className="privacy-copy"><div className="section-index">03 / PRIVACY</div><h2>Share the outcome.<br /><em>Not the person.</em></h2><p>A public report carries the activity, an approximate area, capture time, and a reference. No name, phone number, identity document, or exact location is included.</p>
          <ul><li><CheckIcon /><span><strong>Original media stays on the phone</strong> unless the reporter explicitly chooses to share it.</span></li><li><CheckIcon /><span><strong>No login is needed</strong> to check a shared report.</span></li><li><CheckIcon /><span><strong>Honest by design</strong> with no claim beyond what the prototype implements.</span></li></ul>
          <Link className="text-link" href="/privacy">Read our privacy approach <ArrowIcon /></Link>
        </div>
      </section>

      <section className="experience-section" id="experience">
        <div className="experience-copy"><div className="section-index">04 / EXPERIENCE</div><h2>Built for a thumb.<br /><em>Clear at a glance.</em></h2><p>Friendly language, reassuring offline states, and one next action at every step.</p><Link className="landing-btn landing-btn-dark" href="/pitch">Open the story deck <ArrowIcon /></Link></div>
        <div className="status-stack" aria-label="Example report statuses">
          <div className="status-card status-ready"><span className="status-icon">↓</span><div><small>OFFLINE</small><strong>Saved on this phone</strong><p>We&apos;ll send it when signal returns.</p></div></div>
          <div className="status-card status-sent"><span className="status-icon">↑</span><div><small>SENT</small><strong>Report received</strong><p>Your work is ready to be checked.</p></div></div>
          <div className="status-card status-confirmed"><span className="status-icon"><CheckIcon /></span><div><small>CONFIRMED</small><strong>Community confirmed</strong><p>Two reports point to the same activity.</p></div></div>
        </div>
      </section>

      <section className="try-section" id="try">
        <div className="try-copy"><div className="section-index">05 / TRY PRUFTURE</div><h2>See the full journey.<br /><em>Then take it with you.</em></h2><p>Explore a sample public report, open the programme dashboard, or install the Android preview. The prototype is open and honest about what is live today.</p><div className="try-links"><Link className="landing-btn landing-btn-primary" href={`/verify/${SAMPLE_HASH}`}>Open sample report <ArrowIcon /></Link><Link className="landing-btn landing-btn-ghost" href="/dashboard">View dashboard</Link></div></div>
        <a className="download-card" href={ANDROID_BUILD_URL} target="_blank" rel="noreferrer noopener"><svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label="QR code to install the Android preview"><rect width={size} height={size} fill="#ffffff" /><path d={path} fill="#1c1c1e" /></svg><span><small>ANDROID PREVIEW</small><strong>Scan to install</strong><em>No store or account required</em></span><ArrowIcon /></a>
      </section>

      <section className="closing-section"><Mark compact /><p>Evidence should travel farther than connectivity.</p><h2>Make every completed task<br /><em>visible, verifiable, and human.</em></h2><Link className="landing-btn landing-btn-white" href={`/verify/${SAMPLE_HASH}`}>Explore Prufture <ArrowIcon /></Link></section>

      <footer className="landing-footer"><div><Mark /><p>An open prototype for community field reporting.</p></div><div className="footer-links"><Link href="/dashboard">Dashboard</Link><Link href="/pitch">Pitch</Link><Link href="/support">Support</Link><Link href="/privacy">Privacy</Link></div><p className="footer-note">Built for a hackathon. Not a UNICEF product or endorsement.</p></footer>
    </main>
  );
}
