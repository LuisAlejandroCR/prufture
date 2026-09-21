// purchases.ts: typed port over react-native-purchases (RevenueCat). Screens never import
// the vendor SDK directly — everything they need comes through this module and useEntitlement.
// Every call returns the project's ExternalResult envelope and never throws through the flow
// (same contract as apps/api/src/neuro.ts).
//
// Privacy: the RevenueCat app user id must never be PII. This module leaves the SDK on its
// default anonymous id (no logIn with an email/phone/hash — Purchases.configure alone is
// enough). Subscriber attributes are never set: no report hash, location, task id, media
// ref, or identity credential is ever attached to a RevenueCat user.

import type Purchases from "react-native-purchases";
import type { CustomerInfo, PurchasesOffering, PurchasesPackage } from "react-native-purchases";
import { ok, unavailable, type ExternalResult } from "@proof/core";

const SOURCE = "revenuecat";
const ENTITLEMENT_ID = "coordinator_pro";

let configured = false;
let purchasesModule: typeof Purchases | null = null;

async function loadPurchases(): Promise<typeof Purchases> {
  if (!purchasesModule) {
    purchasesModule = (await import("react-native-purchases")).default;
  }
  return purchasesModule;
}

/** Test-only: inject a fake SDK module instead of importing the native one. */
export function __setPurchasesModuleForTest(mod: typeof Purchases | null): void {
  purchasesModule = mod;
}

/** Test-only: reset the configure-once guard between tests. */
export function __resetConfiguredForTest(): void {
  configured = false;
}

/**
 * The PUBLIC RevenueCat SDK key for the platform this bundle is running on.
 *
 * RevenueCat issues a different public key per platform — `appl_…` for iOS, `goog_…` for
 * Android — and configuring with the other platform's key fails at runtime. A single shared
 * env var cannot serve a two-platform release, so each has its own.
 *
 * These are PUBLIC keys and are meant to ship in the client. The SECRET key (`sk_…`) is
 * server-side only and must never appear in this bundle — see apps/api/src/entitlement.ts.
 */
export function revenuecatApiKey(platform: string): string {
  // RevenueCat Test Store: one platform-agnostic `test_...` key that works with no App Store or
  // Play setup at all, so the purchase -> entitlement -> gated-endpoint path can be exercised
  // before the store accounts exist. It takes precedence deliberately, and ONLY a key that
  // actually looks like a Test Store key is accepted here — so a real `appl_`/`goog_` key
  // pasted into this variable by mistake is ignored rather than silently used everywhere.
  const test = process.env.EXPO_PUBLIC_REVENUECAT_TEST_KEY ?? "";
  if (test.startsWith("test_")) return test;

  if (platform === "ios") return process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? "";
  if (platform === "android") return process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY ?? "";
  return "";
}

/**
 * True when the SDK would run against the Test Store rather than a real store. Purchases made in
 * this mode are NOT real revenue and prove our integration only — never Apple's or Google's.
 * A release build must not ship with this set; `eas.json`'s production profile leaves it out.
 */
export function usingTestStore(): boolean {
  return (process.env.EXPO_PUBLIC_REVENUECAT_TEST_KEY ?? "").startsWith("test_");
}

/**
 * Configure the SDK for the running platform. The caller passes `Platform.OS` — this module
 * deliberately does not import react-native, so it stays unit-testable under node.
 * Safe on every launch: a missing key or a second call are both no-ops, and it never throws.
 */
export async function configurePurchasesForPlatform(platform: string): Promise<void> {
  await configurePurchases({ apiKey: revenuecatApiKey(platform) });
}

/**
 * Configure the RevenueCat SDK exactly once with the given public API key.
 * No-op (with a logged typed warning) when `apiKey` is falsy — never throws.
 */
export async function configurePurchases({ apiKey }: { apiKey: string }): Promise<void> {
  if (!apiKey) {
    console.warn("[purchases] configurePurchases: missing apiKey, skipping (degraded)");
    return;
  }
  if (configured) return;
  const RC = await loadPurchases();
  RC.configure({ apiKey });
  configured = true;
}

function toOffering(offering: PurchasesOffering | null): Offering | null {
  if (!offering) return null;
  return { identifier: offering.identifier, monthly: offering.monthly, annual: offering.annual };
}

export interface Offering {
  identifier: string;
  monthly: PurchasesPackage | null;
  annual: PurchasesPackage | null;
}

export async function getOfferings(): Promise<ExternalResult<Offering>> {
  try {
    const RC = await loadPurchases();
    const offerings = await RC.getOfferings();
    const current = toOffering(offerings.current);
    if (!current) return unavailable(SOURCE, "no current offering configured");
    return ok(SOURCE, current);
  } catch (e) {
    return unavailable(SOURCE, e);
  }
}

export async function purchasePackage(
  pkg: PurchasesPackage,
): Promise<ExternalResult<{ entitled: boolean }>> {
  try {
    const RC = await loadPurchases();
    const { customerInfo } = await RC.purchasePackage(pkg);
    return ok(SOURCE, { entitled: isEntitled(customerInfo) });
  } catch (e) {
    if (isUserCancelled(e)) return ok(SOURCE, { entitled: false });
    return unavailable(SOURCE, e);
  }
}

export async function restorePurchases(): Promise<ExternalResult<{ entitled: boolean }>> {
  try {
    const RC = await loadPurchases();
    const customerInfo = await RC.restorePurchases();
    return ok(SOURCE, { entitled: isEntitled(customerInfo) });
  } catch (e) {
    return unavailable(SOURCE, e);
  }
}

export interface Entitlement {
  entitled: boolean;
  willRenew: boolean;
  expires: string | null;
}

export async function getEntitlement(): Promise<ExternalResult<Entitlement>> {
  try {
    const RC = await loadPurchases();
    const customerInfo = await RC.getCustomerInfo();
    const active = customerInfo.entitlements.active[ENTITLEMENT_ID];
    return ok(SOURCE, {
      entitled: Boolean(active),
      willRenew: active?.willRenew ?? false,
      expires: active?.expirationDate ?? null,
    });
  } catch (e) {
    return unavailable(SOURCE, e);
  }
}

function isEntitled(customerInfo: CustomerInfo): boolean {
  return Boolean(customerInfo.entitlements.active[ENTITLEMENT_ID]);
}

function isUserCancelled(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { userCancelled?: unknown }).userCancelled === true;
}
