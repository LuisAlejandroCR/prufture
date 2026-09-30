// sign-in/[[...sign-in]]/page.tsx: staff sign-in for the programme dashboard. Reporters never sign
// in; this page exists only for /dashboard. Without Clerk keys it explains that sign-in is off.
// Split layout: a terracotta brand panel echoing the landing close, and the form.

import { ClerkProvider, SignIn } from "@clerk/nextjs";
import Link from "next/link";
import { isStaffAuthConfigured } from "../../../lib/staff-auth";
import { Icon, Mark } from "../../_components/brand";

export const metadata = { title: "Staff sign-in · Prufture" };

export default function SignInPage() {
  return (
    <main className="staff-signin">
      <section className="signin-brand">
        <Link href="/" style={{ textDecoration: "none" }}>
          <Mark />
        </Link>
        <div>
          <h1>
            Programme <em>workspace</em>
          </h1>
          <p>Review field reports, follow confirmations and see coverage by approximate area.</p>
        </div>
        <ul>
          <li><Icon name="check" size={16} /> Region-level data only</li>
          <li><Icon name="check" size={16} /> No reporter identity, ever</li>
          <li><Icon name="check" size={16} /> Public reports stay checkable without login</li>
        </ul>
      </section>
      <section className="signin-form">
        <p className="staff-signin-note">
          Staff sign-in for the programme dashboard. Reporters never need an account.
        </p>
        {isStaffAuthConfigured() ? (
          <ClerkProvider>
            <SignIn path="/sign-in" routing="path" forceRedirectUrl="/dashboard" />
          </ClerkProvider>
        ) : (
          <div className="empty" style={{ maxWidth: 420 }}>
            <span className="empty-icon">
              <Icon name="lock" size={22} />
            </span>
            <strong>Staff sign-in is not configured</strong>
            <p>This deployment has no sign-in keys, so the dashboard is open.</p>
            <Link className="btn" href="/dashboard" style={{ marginTop: 12 }}>
              Open the dashboard
            </Link>
          </div>
        )}
      </section>
    </main>
  );
}
