// robots.ts: public pages may be indexed; the staff workspace and its sign-in steps may not. The
// dashboard can run open (no staff keys), so it also carries a noindex robots meta of its own.

import type { MetadataRoute } from "next";
import { SITE_URL } from "../lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/dashboard", "/sign-in", "/invite"] }],
    host: SITE_URL,
  };
}
