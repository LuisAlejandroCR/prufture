// error.tsx: dashboard error boundary. Shows a calm, honest message and a retry, never a stack
// trace or raw error text (which could carry internal detail); the digest is safe to quote.

"use client";

import Link from "next/link";
import { Icon } from "../_components/brand";

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <section className="fade-in">
      <div className="empty">
        <span className="empty-icon">
          <Icon name="alert" size={22} />
        </span>
        <strong>This page could not be loaded</strong>
        <p>Something went wrong while preparing the dashboard. No report data was changed.</p>
        <div className="empty-actions">
          <button type="button" className="btn" onClick={reset}>
            Try again
          </button>
          <Link className="btn secondary" href="/dashboard">
            Back to overview
          </Link>
        </div>
        {error.digest ? <p className="faint empty-ref">Reference {error.digest}</p> : null}
      </div>
    </section>
  );
}
