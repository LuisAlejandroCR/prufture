// entitlement.ts: server-side RevenueCat entitlement check. This is the source of truth for
// any future coordinator-gated endpoint — a client-reported boolean is never trusted.
// Degrades via guard()/unavailable() — never throws, never logs the secret key or the raw
// response body (same contract as neuro.ts).

import { guard, unavailable, type ExternalResult } from "@proof/core";
import { env } from "./env.js";

const ENTITLEMENT_ID = "coordinator_pro";
const TIMEOUT_MS = 5000;

interface RevenueCatEntitlementItem {
  entitlement_id?: unknown;
  expires_at?: unknown;
}

interface RevenueCatEntitlementsResponse {
  items?: RevenueCatEntitlementItem[];
}

/**
 * Ask RevenueCat whether `appUserId` currently holds the coordinator_pro entitlement.
 * - Missing REVENUECAT_SECRET_KEY => typed unavailable, no throw.
 * - Configured => GET behind guard() with a 5s timeout; any failure => typed unavailable.
 * The secret key and the raw response body never appear in the returned result or a thrown
 * message — exactly one boolean is derived and returned.
 */
export async function checkEntitlement(
  appUserId: string,
): Promise<ExternalResult<{ entitled: boolean }>> {
  if (!env.revenuecatSecretKey) {
    return unavailable("revenuecat", "revenuecat not configured (REVENUECAT_SECRET_KEY missing)");
  }

  return guard("revenuecat", async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const base = env.revenuecatApiBase.replace(/\/$/, "");
      const url = `${base}/customers/${encodeURIComponent(appUserId)}/entitlements`;
      const res = await fetch(url, {
        headers: { authorization: `Bearer ${env.revenuecatSecretKey}` },
        signal: controller.signal,
      });

      const body = (await res.json().catch(() => ({}))) as RevenueCatEntitlementsResponse;
      if (!res.ok) {
        // Do not echo the response body — never log or return it.
        throw new Error(`revenuecat ${res.status}`);
      }

      const items = Array.isArray(body.items) ? body.items : [];
      const now = Date.now();
      const entitled = items.some((item) => {
        if (item.entitlement_id !== ENTITLEMENT_ID) return false;
        if (typeof item.expires_at !== "number") return true;
        return item.expires_at > now;
      });

      return { entitled };
    } finally {
      clearTimeout(timer);
    }
  });
}
