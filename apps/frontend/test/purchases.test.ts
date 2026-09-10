// purchases.test.ts: the RevenueCat port (src/purchases.ts). The vendor SDK is never
// imported here — a fake module is injected via __setPurchasesModuleForTest, following the
// project's injection pattern (see liveness.test.ts injecting fetch).

import { test } from "node:test";
import assert from "node:assert/strict";
import type Purchases from "react-native-purchases";
import {
  __resetConfiguredForTest,
  __setPurchasesModuleForTest,
  configurePurchases,
  getEntitlement,
  getOfferings,
  purchasePackage,
  restorePurchases,
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
