// site.ts: absolute URLs of the public site. A share link or QR code on /verify must point at the
// live site even when NEXT_PUBLIC_VERIFY_BASE_URL is not set, never at a developer's localhost.

const trim = (u: string | undefined) => (u ?? "").trim().replace(/\/+$/, "");

export const SITE_URL = trim(process.env.NEXT_PUBLIC_SITE_URL) || "https://prufture.voltarut.com";

/** Base for public report links: the verify override, else the site URL. */
export function verifyBase(env: { verify?: string; site?: string } = {
  verify: process.env.NEXT_PUBLIC_VERIFY_BASE_URL,
  site: process.env.NEXT_PUBLIC_SITE_URL,
}): string {
  return trim(env.verify) || trim(env.site) || "https://prufture.voltarut.com";
}

/** The preferred sample report, if the deploy names one (NEXT_PUBLIC_SAMPLE_HASH). */
export const PREFERRED_SAMPLE_HASH =
  process.env.NEXT_PUBLIC_SAMPLE_HASH?.trim() || "992f8d6232210e99a6ed60a9c23dc22b3a304cd0c0d13bbdecf16f3c573d5d75";
