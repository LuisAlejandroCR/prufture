// middleware.ts: staff sign-in gate for /dashboard. With Clerk keys set, unsigned visitors are sent
// to /sign-in; with STAFF_INVITE_CODES also set, signed-in staff must redeem an invitation code at
// /invite first. Without keys every request passes (the dashboard shows a "not configured" banner).
// The matcher keeps Clerk off every public route, including /verify.

import { clerkClient, clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { STAFF_SIGN_IN_PATH, isStaffAuthConfigured, isStaffPath } from "./lib/staff-auth";
import {
  INVITE_COOKIE,
  INVITE_COOKIE_MAX_AGE_S,
  INVITE_PATH,
  isActiveCodeHash,
  isInvitePath,
  isInviteRequired,
  signPass,
  verifyPass,
} from "./lib/staff-invite";

const withClerk = clerkMiddleware(
  async (auth, req) => {
    const path = req.nextUrl.pathname;
    if (!isStaffPath(path) && !isInvitePath(path)) return;
    await auth.protect();
    if (!isStaffPath(path) || !isInviteRequired()) return;

    const { userId } = await auth();
    if (!userId) return;
    if (await verifyPass(req.cookies.get(INVITE_COOKIE)?.value, userId)) return;

    // No valid pass cookie: fall back to the redemption stored on the Clerk user.
    let stored: unknown;
    try {
      const user = await (await clerkClient()).users.getUser(userId);
      stored = user.privateMetadata?.staffInvite;
    } catch {
      return NextResponse.redirect(new URL(`${INVITE_PATH}?state=unavailable`, req.url));
    }
    if (typeof stored === "string" && (await isActiveCodeHash(stored))) {
      const res = NextResponse.next();
      res.cookies.set(INVITE_COOKIE, await signPass(userId, stored), {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: INVITE_COOKIE_MAX_AGE_S,
      });
      return res;
    }
    return NextResponse.redirect(new URL(INVITE_PATH, req.url));
  },
  { signInUrl: STAFF_SIGN_IN_PATH },
);

export default function middleware(req: NextRequest, event: NextFetchEvent) {
  if (!isStaffAuthConfigured()) return NextResponse.next();
  return withClerk(req, event);
}

export const config = {
  matcher: ["/dashboard", "/dashboard/:path*", "/sign-in", "/sign-in/:path*", "/invite", "/invite/:path*"],
};
