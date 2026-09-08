// push.test.ts: pure push-registration helpers (src/push.ts). No native imports here —
// the Expo glue in src/notifications.ts is grepped by store-config.test.ts instead.

import { test } from "node:test";
import assert from "node:assert/strict";
import { isExpoPushToken, randomDeviceId, toRegisterBody } from "../src/push";

test("toRegisterBody emits exactly deviceId + token, nothing else", () => {
  const body = toRegisterBody("deadbeefdeadbeef", "ExpoPushToken[abc]");
  assert.deepEqual(Object.keys(body).sort(), ["deviceId", "token"]);
  assert.equal(body.deviceId, "deadbeefdeadbeef");
  assert.equal(body.token, "ExpoPushToken[abc]");
});

test("isExpoPushToken accepts both Expo forms and rejects everything else", () => {
  assert.equal(isExpoPushToken("ExponentPushToken[xxx]"), true);
  assert.equal(isExpoPushToken("ExpoPushToken[xxx]"), true);
  assert.equal(isExpoPushToken("Bearer xyz"), false);
  assert.equal(isExpoPushToken(null), false);
});

test("randomDeviceId is 32 lowercase hex chars and uses the injected RNG", () => {
  let called = 0;
  const rng = (a: Uint8Array) => {
    called += 1;
    a.fill(0xab);
    return a;
  };
  const id = randomDeviceId(rng);
  assert.equal(called, 1);
  assert.match(id, /^[0-9a-f]{32}$/);
  assert.equal(id, "ab".repeat(16));
});
