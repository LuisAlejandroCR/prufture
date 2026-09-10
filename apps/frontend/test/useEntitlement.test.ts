// useEntitlement.test.ts: the pure ExternalResult -> status mapping used by the hook.
// available:false must always map to "unavailable", never ambiguously to "free".

import { test } from "node:test";
import assert from "node:assert/strict";
import { mapEntitlementResult } from "../src/useEntitlement";

test("available:false maps to unavailable", () => {
  const status = mapEntitlementResult({
    available: false,
    source: "revenuecat",
    checkedAt: new Date().toISOString(),
    data: null,
    error: "boom",
  });
  assert.equal(status, "unavailable");
});

test("available:true with entitled:true maps to entitled", () => {
  const status = mapEntitlementResult({
    available: true,
    source: "revenuecat",
    checkedAt: new Date().toISOString(),
    data: { entitled: true, willRenew: true, expires: null },
    error: null,
  });
  assert.equal(status, "entitled");
});

test("available:true with entitled:false maps to free", () => {
  const status = mapEntitlementResult({
    available: true,
    source: "revenuecat",
    checkedAt: new Date().toISOString(),
    data: { entitled: false, willRenew: false, expires: null },
    error: null,
  });
  assert.equal(status, "free");
});
