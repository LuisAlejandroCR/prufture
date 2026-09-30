// actions.ts: the server action behind /invite. Checks the code against STAFF_INVITE_CODES, stores
// only its hash on the Clerk user (privateMetadata, never readable by the browser), sets the signed
// pass cookie and opens the dashboard. A wrong code costs a short delay and says so plainly.

"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { STAFF_SIGN_IN_PATH } from "../../lib/staff-auth";
import { INVITE_COOKIE, INVITE_COOKIE_MAX_AGE_S, INVITE_PATH, matchInvite, signPass } from "../../lib/staff-invite";

export async function redeemInvite(form: FormData): Promise<void> {
  const { userId } = await auth();
  if (!userId) redirect(STAFF_SIGN_IN_PATH);

  const input = String(form.get("code") ?? "").slice(0, 200);
  const hash = await matchInvite(input);
  if (!hash) {
    // Slows guessing; codes are also required to be at least MIN_CODE_LENGTH characters.
    await new Promise((r) => setTimeout(r, 800));
    redirect(`${INVITE_PATH}?state=invalid`);
  }

  try {
    await (await clerkClient()).users.updateUserMetadata(userId, { privateMetadata: { staffInvite: hash } });
  } catch {
    redirect(`${INVITE_PATH}?state=unavailable`);
  }

  (await cookies()).set(INVITE_COOKIE, await signPass(userId, hash), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: INVITE_COOKIE_MAX_AGE_S,
  });
  redirect("/dashboard");
}
