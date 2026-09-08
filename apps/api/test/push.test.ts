// push.test.ts: anonymous push-token store + POST /register-push.
// Invariant under test: a registration carries a device id and an Expo push token and
// nothing else — no identity, no proof link — and hostile input never throws.

import { test } from "node:test";
import assert from "node:assert/strict";
import { app } from "../src/index.js";
import {
  allPushTokens,
  isExpoPushToken,
  pushRegistrationCount,
  registerPushToken,
  __resetPushStoreForTests,
} from "../src/push-store.js";

const DEVICE = "a1b2c3d4e5f60718";
const TOKEN = "ExponentPushToken[abcdEFGH1234]";

const call = (body: unknown) =>
  app.request("/register-push", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

test("registerPushToken accepts a well-formed device id + token and dedupes by device id", () => {
  __resetPushStoreForTests();
  assert.equal(registerPushToken(DEVICE, TOKEN), true);
  assert.equal(registerPushToken(DEVICE, "ExpoPushToken[second]"), true);
  assert.equal(pushRegistrationCount(), 1);
  assert.deepEqual(allPushTokens(), ["ExpoPushToken[second]"]);
});

test("registerPushToken rejects malformed input without throwing", () => {
  __resetPushStoreForTests();
  for (const bad of [
    [null, TOKEN],
    [DEVICE, null],
    ["", TOKEN],
    ["not-hex-!!", TOKEN],
    [DEVICE, "randomstring"],
    [DEVICE, { evil: true }],
    [{ toString: () => DEVICE }, TOKEN],
    [DEVICE.repeat(10), TOKEN],
  ] as Array<[unknown, unknown]>) {
    assert.equal(registerPushToken(bad[0], bad[1]), false);
  }
  assert.equal(pushRegistrationCount(), 0);
});

test("isExpoPushToken matches both Expo token forms only", () => {
  assert.equal(isExpoPushToken("ExponentPushToken[xxx]"), true);
  assert.equal(isExpoPushToken("ExpoPushToken[xxx]"), true);
  assert.equal(isExpoPushToken("ExpoPushToken"), false);
  assert.equal(isExpoPushToken(""), false);
  assert.equal(isExpoPushToken(42), false);
});

test("POST /register-push: 200 for a valid body, count returned", async () => {
  __resetPushStoreForTests();
  const res = await call({ deviceId: DEVICE, token: TOKEN });
  assert.equal(res.status, 200);
  const j = (await res.json()) as { registered: boolean; count: number };
  assert.equal(j.registered, true);
  assert.equal(j.count, 1);
});

test("POST /register-push: proofOwnerRef is ignored, never linked to the token", async () => {
  __resetPushStoreForTests();
  const res = await call({ deviceId: DEVICE, token: TOKEN, proofOwnerRef: "e".repeat(64) });
  assert.equal(res.status, 200);
  // The store keeps only deviceId + token + timestamp; there is no place a proof ref could land.
  assert.deepEqual(allPushTokens(), [TOKEN]);
});

test("POST /register-push: 400 for a malformed body or bad JSON", async () => {
  for (const body of [{ deviceId: "x", token: TOKEN }, { token: TOKEN }, { deviceId: DEVICE }]) {
    const res = await call(body);
    assert.equal(res.status, 400);
  }
  const badJson = await app.request("/register-push", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{not json",
  });
  assert.equal(badJson.status, 400);
});
