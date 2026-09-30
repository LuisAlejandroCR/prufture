// staff-auth.ts: when staff sign-in (Clerk) is on, and which paths it guards. Only /dashboard is
// staff-only; the landing, /verify and legal pages stay public and never load Clerk.
// Pure so middleware, layouts and tests share one definition.

type Env = Record<string, string | undefined>;

/** Clerk is on only when both keys are present; otherwise the dashboard degrades to open + banner. */
export function isStaffAuthConfigured(env: Env = process.env): boolean {
  return Boolean(env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim() && env.CLERK_SECRET_KEY?.trim());
}

/** True for /dashboard and everything under it (pages and export downloads). */
export function isStaffPath(pathname: string): boolean {
  return pathname === "/dashboard" || pathname.startsWith("/dashboard/");
}

export const STAFF_SIGN_IN_PATH = "/sign-in";
