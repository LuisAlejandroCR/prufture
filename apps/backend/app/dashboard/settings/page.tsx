// settings/page.tsx: dashboard settings placeholder. The demo has no per-user configuration, so
// this states what is fixed rather than showing dead controls.

import { Icon } from "../../_components/brand";
import { PageHeader } from "../ui";

export const metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <section className="fade-in">
      <PageHeader eyebrow="Admin" title="Settings" lede="What this dashboard shows and what it never shows." />

      <div className="card-grid card-grid-2">
        <article className="box option-card">
          <span className="option-icon tone-ok">
            <Icon name="check" size={22} />
          </span>
          <h3>Data shown</h3>
          <ul className="check-list">
            <li>Activity, programme grouping, and review status.</li>
            <li>Approximate region only, at most five characters of a geohash.</li>
            <li>Capture date and confirmation count.</li>
          </ul>
        </article>

        <article className="box option-card">
          <span className="option-icon tone-attn">
            <Icon name="eyeOff" size={22} />
          </span>
          <h3>Never shown</h3>
          <ul className="check-list is-never">
            <li>Reporter name, phone, email, or any identity attribute.</li>
            <li>Exact coordinates or a full private geohash.</li>
            <li>Original photos or private media links.</li>
            <li>Internal thresholds or scoring rules.</li>
          </ul>
        </article>
      </div>

      <p className="faint" style={{ fontSize: "0.9rem", marginTop: "var(--sp-4)" }}>
        Staff sign-in is controlled by the deployment. When it is not configured the dashboard is
        open, matching the public verify page, and says so at the top of every page.
      </p>
    </section>
  );
}
