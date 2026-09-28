// sign-in/[[...sign-in]]/page.tsx: staff sign-in for the programme dashboard. Reporters never sign
// in; this page exists only for /dashboard. Without Clerk keys it explains that sign-in is off.

import { ClerkProvider, SignIn } from "@clerk/nextjs";
import Link from "next/link";
import { isStaffAuthConfigured } from "../../../lib/staff-auth";

export const metadata = { title: "Staff sign-in · Prufture" };

export default function SignInPage() {
  return (
    <main className="staff-signin">
      <p className="staff-signin-note">
        Staff sign-in for the programme dashboard. Reporters never need an account.
      </p>
      {isStaffAuthConfigured() ? (
        <ClerkProvider>
          <SignIn path="/sign-in" routing="path" forceRedirectUrl="/dashboard" />
        </ClerkProvider>
      ) : (
        <p>
          Staff sign-in is not configured on this deployment. <Link href="/dashboard">Open the dashboard</Link>.
        </p>
      )}
    </main>
  );
}
