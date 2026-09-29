// purchases.test.ts: the RevenueCat port (src/purchases.ts). The vendor SDK is never
// imported here — a fake module is injected via __setPurchasesModuleForTest, following the
// project's injection pattern (see liveness.test.ts injecting fetch).

import { test } from "node:test";
import assert from "node:assert/strict";
import type Purchases from "react-native-purchases";
import { readFileSync } from "node:fs";
import {
  __resetConfiguredForTest,
  configurePurchasesForPlatform,
  __setPurchasesModuleForTest,
  configurePurchases,
  revenuecatApiKey,
  usingTestStore,
  getEntitlement,
  getOfferings,
  purchasePackage,
  restorePurchases,
  getAppUserId,
  manageSubscriptionsUrl,
} from "../src/purchases";

const monthlyPkg = { identifier: "monthly", product: { priceString: "$4.99" } } as any;
const annualPkg = { identifier: "annual", product: { priceString: "$39.99" } } as any;

function fakeCustomerInfo(entitled: boolean) {
  return {
    entitlements: {
      active: entitled
        ? { coordinator_pro: { willRenew: true, expirationDate: "2027-01-01T00:00:00.000Z" } }
        : {},
    },
  } as any;
}

function install(overrides: Partial<typeof Purchases> = {}) {
  __resetConfiguredForTest();
  const fake = {
    configure: () => {},
    getOfferings: async () => ({ current: { identifier: "default", monthly: monthlyPkg, annual: annualPkg } }),
    purchasePackage: async () => ({ customerInfo: fakeCustomerInfo(true) }),
    restorePurchases: async () => fakeCustomerInfo(true),
    getCustomerInfo: async () => fakeCustomerInfo(true),
    ...overrides,
  };
  __setPurchasesModuleForTest(fake as unknown as typeof Purchases);
  return fake;
}

test("configurePurchases: calls SDK configure exactly once", async () => {
  let calls = 0;
  install({ configure: (() => { calls += 1; }) as any });
  await configurePurchases({ apiKey: "pk_test" });
  await configurePurchases({ apiKey: "pk_test" });
  assert.equal(calls, 1);
});

test("configurePurchases: no-op with falsy apiKey, never throws", async () => {
  let calls = 0;
  install({ configure: (() => { calls += 1; }) as any });
  await configurePurchases({ apiKey: "" });
  assert.equal(calls, 0);
});

test("getOfferings: success maps to available:true with the current offering", async () => {
  install();
  const result = await getOfferings();
  assert.equal(result.available, true);
  if (result.available) {
    assert.equal(result.data.identifier, "default");
    assert.equal(result.data.monthly, monthlyPkg);
    assert.equal(result.data.annual, annualPkg);
  }
});

test("getOfferings: SDK throw maps to available:false without throwing", async () => {
  install({
    getOfferings: async () => {
      throw new Error("network down");
    },
  });
  const result = await getOfferings();
  assert.equal(result.available, false);
});

test("getOfferings: no current offering maps to available:false", async () => {
  install({ getOfferings: (async () => ({ current: null })) as any });
  const result = await getOfferings();
  assert.equal(result.available, false);
});

test("purchasePackage: user-cancelled maps to entitled:false, not an error", async () => {
  install({
    purchasePackage: async () => {
      const err: any = new Error("cancelled");
      err.userCancelled = true;
      throw err;
    },
  });
  const result = await purchasePackage(monthlyPkg);
  assert.equal(result.available, true);
  if (result.available) assert.equal(result.data.entitled, false);
});

test("purchasePackage: store error maps to available:false", async () => {
  install({
    purchasePackage: async () => {
      throw new Error("store unavailable");
    },
  });
  const result = await purchasePackage(monthlyPkg);
  assert.equal(result.available, false);
});

test("purchasePackage: success reads entitlement from returned customerInfo", async () => {
  install({ purchasePackage: (async () => ({ customerInfo: fakeCustomerInfo(true) })) as any });
  const result = await purchasePackage(monthlyPkg);
  assert.equal(result.available, true);
  if (result.available) assert.equal(result.data.entitled, true);
});

test("restorePurchases: success reads entitlement", async () => {
  install({ restorePurchases: async () => fakeCustomerInfo(true) });
  const result = await restorePurchases();
  assert.equal(result.available, true);
  if (result.available) assert.equal(result.data.entitled, true);
});

test("restorePurchases: store error maps to available:false", async () => {
  install({
    restorePurchases: async () => {
      throw new Error("boom");
    },
  });
  const result = await restorePurchases();
  assert.equal(result.available, false);
});

test("getEntitlement: reads coordinator_pro when active", async () => {
  install({ getCustomerInfo: async () => fakeCustomerInfo(true) });
  const result = await getEntitlement();
  assert.equal(result.available, true);
  if (result.available) {
    assert.equal(result.data.entitled, true);
    assert.equal(result.data.willRenew, true);
    assert.equal(result.data.expires, "2027-01-01T00:00:00.000Z");
  }
});

test("getEntitlement: missing entitlement maps to entitled:false", async () => {
  install({ getCustomerInfo: async () => fakeCustomerInfo(false) });
  const result = await getEntitlement();
  assert.equal(result.available, true);
  if (result.available) {
    assert.equal(result.data.entitled, false);
    assert.equal(result.data.willRenew, false);
    assert.equal(result.data.expires, null);
  }
});

test("getEntitlement: expired entitlement (absent from active map) maps to entitled:false", async () => {
  // RevenueCat's `entitlements.active` only ever contains currently-active entitlements, so
  // an expired one is indistinguishable from "never purchased" at this layer.
  install({ getCustomerInfo: async () => fakeCustomerInfo(false) });
  const result = await getEntitlement();
  assert.equal(result.available, true);
  if (result.available) assert.equal(result.data.entitled, false);
});

test("getEntitlement: SDK throw maps to available:false without throwing", async () => {
  install({
    getCustomerInfo: async () => {
      throw new Error("network down");
    },
  });
  const result = await getEntitlement();
  assert.equal(result.available, false);
});

test("revenuecatApiKey: each platform gets its OWN public key, never the other one's", () => {
  process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY = "appl_ios_public";
  process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY = "goog_android_public";
  try {
    assert.equal(revenuecatApiKey("ios"), "appl_ios_public");
    assert.equal(revenuecatApiKey("android"), "goog_android_public");
    // Configuring RevenueCat with the other platform's key fails at runtime, so the two must
    // never be interchangeable.
    assert.notEqual(revenuecatApiKey("ios"), revenuecatApiKey("android"));
  } finally {
    delete process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY;
    delete process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY;
  }
});

test("revenuecatApiKey: unset key or unknown platform yields '' (configure then no-ops)", () => {
  delete process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY;
  delete process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY;
  assert.equal(revenuecatApiKey("ios"), "");
  assert.equal(revenuecatApiKey("android"), "");
  assert.equal(revenuecatApiKey("web"), "");
  assert.equal(revenuecatApiKey(""), "");
});

test("configurePurchasesForPlatform: no key => SDK configure is never called, no throw", async () => {
  delete process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY;
  let calls = 0;
  install({ configure: () => { calls += 1; } });
  await configurePurchasesForPlatform("ios");
  assert.equal(calls, 0);
});

test("configurePurchasesForPlatform: ios key present => configured with exactly that key", async () => {
  process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY = "appl_ios_public";
  process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY = "goog_android_public";
  try {
    const seen: string[] = [];
    install({ configure: ((opts: { apiKey: string }) => { seen.push(opts.apiKey); }) as never });
    await configurePurchasesForPlatform("ios");
    assert.deepEqual(seen, ["appl_ios_public"]);
  } finally {
    delete process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY;
    delete process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY;
  }
});

test("store URLs in app.json are absolute https and point at the published pages", () => {
  const app = JSON.parse(readFileSync(new URL("../app.json", import.meta.url), "utf8")) as {
    expo: { extra: { privacyPolicyUrl: string; supportUrl: string } };
  };
  const { privacyPolicyUrl, supportUrl } = app.expo.extra;
  // App review rejects a placeholder or a relative URL outright.
  for (const url of [privacyPolicyUrl, supportUrl]) {
    assert.ok(url.startsWith("https://"), `${url} must be absolute https`);
    assert.ok(!url.includes("[["), `${url} still holds a placeholder`);
  }
  assert.ok(privacyPolicyUrl.endsWith("/privacy"));
  assert.ok(supportUrl.endsWith("/support"));
});

test("Test Store key takes precedence on BOTH platforms", () => {
  process.env.EXPO_PUBLIC_REVENUECAT_TEST_KEY = "test_storekey123";
  process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY = "appl_ios_public";
  process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY = "goog_android_public";
  try {
    assert.equal(revenuecatApiKey("ios"), "test_storekey123");
    assert.equal(revenuecatApiKey("android"), "test_storekey123");
    assert.equal(usingTestStore(), true);
  } finally {
    delete process.env.EXPO_PUBLIC_REVENUECAT_TEST_KEY;
    delete process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY;
    delete process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY;
  }
});

test("a non-test key pasted into the test variable is IGNORED, not used everywhere", () => {
  // Guards the realistic mistake: dropping the iOS key into the test slot would otherwise
  // configure Android with an appl_ key, which fails at runtime.
  process.env.EXPO_PUBLIC_REVENUECAT_TEST_KEY = "appl_pasted_by_mistake";
  process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY = "goog_android_public";
  try {
    assert.equal(revenuecatApiKey("android"), "goog_android_public");
    assert.equal(usingTestStore(), false);
  } finally {
    delete process.env.EXPO_PUBLIC_REVENUECAT_TEST_KEY;
    delete process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY;
  }
});

test("usingTestStore is false when the variable is unset", () => {
  delete process.env.EXPO_PUBLIC_REVENUECAT_TEST_KEY;
  assert.equal(usingTestStore(), false);
});

test("the production eas profile must not ship a Test Store key", () => {
  const eas = JSON.parse(readFileSync(new URL("../eas.json", import.meta.url), "utf8")) as {
    build: Record<string, { env?: Record<string, string> }>;
  };
  const prod = eas.build.production?.env ?? {};
  assert.equal(
    prod.EXPO_PUBLIC_REVENUECAT_TEST_KEY,
    undefined,
    "a Test Store key in the production profile would ship fake purchases to real users",
  );
});

test("configurePurchases never throws when the native module is missing (Expo Go)", async () => {
  // _layout.tsx calls this at launch as a floating promise. If it rejects, Expo Go raises an
  // unhandled rejection on every single launch.
  __resetConfiguredForTest();
  __setPurchasesModuleForTest(null);
  const realWarn = console.warn;
  console.warn = () => {};
  try {
    await assert.doesNotReject(() => configurePurchases({ apiKey: "test_storekey123" }));
  } finally {
    console.warn = realWarn;
  }
});

test("configurePurchases never throws when the SDK's configure() itself throws", async () => {
  __resetConfiguredForTest();
  install({
    configure: (() => {
      throw new Error("native configure exploded");
    }) as never,
  });
  const realWarn = console.warn;
  console.warn = () => {};
  try {
    await assert.doesNotReject(() => configurePurchases({ apiKey: "test_storekey123" }));
  } finally {
    console.warn = realWarn;
  }
});

test("after a failed configure, a later successful configure still works", async () => {
  __resetConfiguredForTest();
  let calls = 0;
  install({
    configure: (() => {
      calls += 1;
      if (calls === 1) throw new Error("boom");
    }) as never,
  });
  const realWarn = console.warn;
  console.warn = () => {};
  try {
    await configurePurchases({ apiKey: "test_a" });
    await configurePurchases({ apiKey: "test_b" });
  } finally {
    console.warn = realWarn;
  }
  assert.equal(calls, 2, "a failed attempt must not latch the configure-once guard");
});

test("getAppUserId returns the SDK's anonymous id and degrades when the SDK fails", async () => {
  install({ getAppUserID: async () => "$RCAnonymousID:abc" } as Partial<typeof Purchases>);
  const result = await getAppUserId();
  assert.equal(result.available, true);
  assert.equal(result.data, "$RCAnonymousID:abc");
  install({
    getAppUserID: async () => {
      throw new Error("not configured");
    },
  } as Partial<typeof Purchases>);
  assert.equal((await getAppUserId()).available, false);
});

test("manageSubscriptionsUrl points at the store the build runs on", () => {
  assert.match(manageSubscriptionsUrl("ios"), /^https:\/\/apps\.apple\.com\//);
  assert.match(manageSubscriptionsUrl("android"), /^https:\/\/play\.google\.com\//);
});
