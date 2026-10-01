// not-found.tsx: /verify/[hash] for a reference the index does not hold. Served with a real 404 (the
// page calls notFound()), with the same wording as before and a way on to a report that exists.

import Link from "next/link";
import { Icon, SiteFooter, SiteHeader } from "../../_components/brand";

export const metadata = { title: "Report not found · Prufture" };

export default function ReportNotFound() {
  return (
    <div className="site">
      <SiteHeader />
      <main className="site-body fade-in">
        <div className="verify-hero state-card">
          <div className="state-icon">
            <Icon name="reports" size={26} />
          </div>
          <h1>Report not found</h1>
          <p className="muted">
            No report is on file for this reference yet. If a reporter just finished it, the phone may
            not have had signal to send it.
          </p>
          <div className="empty-actions">
            <Link className="btn" href="/verify/sample">
              Open a sample report
            </Link>
            <Link className="btn secondary" href="/">
              Back to Prufture
            </Link>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
