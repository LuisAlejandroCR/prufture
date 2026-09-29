// invite/page.tsx: the invitation-code step between staff sign-in and /dashboard. Shown only when
// STAFF_INVITE_CODES is set; otherwise it forwards straight to the dashboard. Same split layout as
// /sign-in so the two steps read as one flow.

import { ClerkProvider, SignOutButton } from "@clerk/nextjs";
import Link from "next/link";
import { redirect } from "next/navigation";
import { STAFF_SIGN_IN_PATH, isStaffAuthConfigured } from "../../lib/staff-auth";
import { isInviteRequired } from "../../lib/staff-invite";
import { Icon, Mark } from "../_components/brand";
import { redeemInvite } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Invitation code · Prufture" };

type Search = Record<string, string | string[] | undefined>;

const STATE_TEXT: Record<string, { tone: "attn" | "info"; text: string }> = {
  invalid: { tone: "attn", text: "That code did not match an active invitation. Check it with the person who invited you." },
  unavailable: { tone: "info", text: "We could not check your invitation just now. Try again in a minute." },
};

export default async function InvitePage({ searchParams }: { searchParams: Promise<Search> }) {
  if (!isStaffAuthConfigured() || !isInviteRequired()) redirect("/dashboard");
  const sp = await searchParams;
  const state = typeof sp.state === "string" ? STATE_TEXT[sp.state] : undefined;

  return (
    <main className="staff-signin">
      <section className="signin-brand">
        <Link href="/" style={{ textDecoration: "none" }}>
          <Mark />
        </Link>
        <div>
          <h1>
            One more <em>step</em>
          </h1>
          <p>The programme workspace is invitation only. Enter the code your programme team shared with you.</p>
        </div>
        <ul>
          <li><Icon name="check" size={16} /> Asked once per account</li>
          <li><Icon name="check" size={16} /> Region-level data only</li>
          <li><Icon name="check" size={16} /> Public reports stay checkable without login</li>
        </ul>
      </section>
      <section className="signin-form">
        <form action={redeemInvite} className="invite-form">
          <label htmlFor="invite-code">
            <strong>Invitation code</strong>
          </label>
          <input
            id="invite-code"
            name="code"
            className="field invite-code"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            required
            minLength={8}
            maxLength={200}
            aria-describedby={state ? "invite-state" : undefined}
            autoFocus
          />
          {state ? (
            <p id="invite-state" className={`notice ${state.tone}`} role="alert">
              <span className="notice-icon"><Icon name="alert" size={18} /></span>
              <span>{state.text}</span>
            </p>
          ) : null}
          <button type="submit" className="btn">
            Continue to the dashboard <Icon name="arrow" size={16} />
          </button>
        </form>
        <ClerkProvider>
          <p className="staff-signin-note">
            Signed in with the wrong account?{" "}
            <SignOutButton redirectUrl={STAFF_SIGN_IN_PATH}>
              <button type="button" className="linkish">Sign out</button>
            </SignOutButton>
          </p>
        </ClerkProvider>
      </section>
    </main>
  );
}
