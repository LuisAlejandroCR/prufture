// settings/page.tsx: dashboard settings placeholder. The demo has no per-user configuration, so
// this states what is fixed rather than showing dead controls.

export default function SettingsPage() {
  return (
    <section className="fade-in">
      <header>
        <h1>Settings</h1>
        <p className="muted">What this dashboard shows and what it never shows.</p>
      </header>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Data shown</h3>
        <ul className="plain">
          <li>Activity, programme grouping, and review status.</li>
          <li>Approximate region only, at most five characters of a geohash.</li>
          <li>Capture date and confirmation count.</li>
        </ul>
      </div>

      <div className="card" style={{ marginTop: "var(--sp-4)" }}>
        <h3 style={{ marginTop: 0 }}>Never shown</h3>
        <ul className="plain">
          <li>Reporter name, phone, email, or any identity attribute.</li>
          <li>Exact coordinates or a full private geohash.</li>
          <li>Original photos or private media links.</li>
          <li>Internal thresholds or scoring rules.</li>
        </ul>
      </div>

      <p className="faint" style={{ fontSize: "0.9rem", marginTop: "var(--sp-4)" }}>
        Access control for this dashboard is a planned feature. In the demo it is open, matching the
        public verify page.
      </p>
    </section>
  );
}
