// entitlement.ts: server-side RevenueCat entitlement check — the source of truth for coordinator-
// gated endpoints; a client-reported boolean is never trusted. Degrades via guard()/unavailable(),
// never throws, and never logs the secret key or the raw response body.

import { guard, unavailable, type ExternalResult } from "@proof/core";
import { env } from "./env.js";

const TIMEOUT_MS = 5000;
// RevenueCat internal entitlement ids look like "entla1b2c3d4e5". Anything else (notably the lookup
// key "coordinator_pro") can never match an active_entitlements item, so it is treated as unset.
const ENTITLEMENT_ID = /^entl[0-9a-z]+$/i;

/** The configured coordinator entitlement id, or null when unset or not an entl... id. */
export function coordinatorEntitlementId(): string | null {
  const v = env.revenuecatCoordinatorEntitlementId;
  return ENTITLEMENT_ID.test(v) ? v : null;
}

interface RevenueCatEntitlementItem {
  entitlement_id?: unknown;
  expires_at?: unknown;
}

/** v2 list envelope: { object: "list", items: [...], next_page, url }. */
interface RevenueCatEntitlementsResponse {
  items?: RevenueCatEntitlementItem[];
}

/**
 * Ask RevenueCat whether `appUserId` currently holds the coordinator_pro entitlement.
 * - Missing REVENUECAT_SECRET_KEY, project id or entl... entitlement id => typed unavailable, no throw.
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
  if (!env.revenuecatProjectId) {
    return unavailable("revenuecat", "revenuecat not configured (REVENUECAT_PROJECT_ID missing)");
  }
  const entitlementId = coordinatorEntitlementId();
  if (!entitlementId) {
    return unavailable(
      "revenuecat",
      "revenuecat not configured (REVENUECAT_COORDINATOR_ENTITLEMENT_ID missing or not an entl... id)",
    );
  }

  return guard("revenuecat", async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      // v2 is project-scoped and the resource is `active_entitlements`, not `entitlements`:
      // GET /v2/projects/{project_id}/customers/{customer_id}/active_entitlements
      // (verified against the Developer API v2 reference, 2026-09-21). The older
      // /v2/customers/{id}/entitlements shape does not exist and 404s.
      const base = env.revenuecatApiBase.replace(/\/$/, "");
      const project = encodeURIComponent(env.revenuecatProjectId);
      const customer = encodeURIComponent(appUserId);
      const url = `${base}/projects/${project}/customers/${customer}/active_entitlements`;
      const res = await fetch(url, {
        headers: { authorization: `Bearer ${env.revenuecatSecretKey}` },
        signal: controller.signal,
      });

      const body = (await res.json().catch(() => ({}))) as RevenueCatEntitlementsResponse;

      // 404 here means RevenueCat has never seen this customer (never purchased): "not entitled",
      // NOT degraded. Verified live 2026-09-21: unknown customer -> 404 resource_missing, while an
      // inaccessible project -> 403, so this cannot mask a bad REVENUECAT_PROJECT_ID. Without it,
      // every coordinator opening the app before subscribing would get a 503 instead of the paywall.
      if (res.status === 404) return { entitled: false };

      if (!res.ok) {
        // Do not echo the response body — never log or return it.
        throw new Error(`revenuecat ${res.status}`);
      }

      const items = Array.isArray(body.items) ? body.items : [];
      const now = Date.now();
      const entitled = items.some((item) => {
        if (item.entitlement_id !== entitlementId) return false;
        if (typeof item.expires_at !== "number") return true;
        return item.expires_at > now;
      });

      return { entitled };
    } finally {
      clearTimeout(timer);
    }
  });
}
