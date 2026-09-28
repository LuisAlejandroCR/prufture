// middleware.ts: staff sign-in gate for /dashboard. With Clerk keys set, unsigned visitors are sent
// to /sign-in; without keys every request passes (the dashboard shows a "not configured" banner).
// The matcher keeps Clerk off every public route, including /verify.

import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { STAFF_SIGN_IN_PATH, isStaffAuthConfigured, isStaffPath } from "./lib/staff-auth";

const withClerk = clerkMiddleware(
  async (auth, req) => {
    if (isStaffPath(req.nextUrl.pathname)) await auth.protect();
  },
  { signInUrl: STAFF_SIGN_IN_PATH },
);

export default function middleware(req: NextRequest, event: NextFetchEvent) {
  if (!isStaffAuthConfigured()) return NextResponse.next();
  return withClerk(req, event);
}

export const config = {
  matcher: ["/dashboard", "/dashboard/:path*", "/sign-in", "/sign-in/:path*"],
};
