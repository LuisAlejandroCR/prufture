// not-found.tsx: site-wide 404 on the shared public chrome, pointing to the places a visitor most
// likely wanted: the home page, a sample public report, and support. Clerk-free.

import Link from "next/link";
import { Icon, SiteFooter, SiteHeader } from "./_components/brand";

export const metadata = { title: "Page not found · Prufture" };

export default function NotFound() {
  return (
    <div className="site">
      <SiteHeader />
      <main className="site-body fade-in">
        <div className="verify-hero state-card">
          <div className="state-icon">
            <Icon name="help" size={26} />
          </div>
          <p className="eyebrow-label">Error 404</p>
          <h1>
            This page is <em>not here</em>
          </h1>
          <p className="muted">
            The link may be mistyped or out of date. If you were checking a report, open the full link
            you were sent; public report pages never need an account.
          </p>
          <div className="empty-actions">
            <Link className="btn" href="/">
              Go to the home page
            </Link>
            <Link className="btn secondary" href="/support">
              Get help
            </Link>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
