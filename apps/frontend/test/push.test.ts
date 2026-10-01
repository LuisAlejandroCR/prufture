// push.test.ts: pure push helpers (src/push.ts). OneSignal replaced the Expo token registration; the
// app id is public build config, and a malformed or missing one leaves push off rather than half-on.

import { test } from "node:test";
import assert from "node:assert/strict";
import { oneSignalAppId } from "../src/push";

test("oneSignalAppId accepts a OneSignal app id (a UUID) and nothing else", () => {
  const id = "6b1f6c4a-3f3e-4a8e-9a55-2f1d9c0b7e21";
  assert.equal(oneSignalAppId({ EXPO_PUBLIC_ONESIGNAL_APP_ID: id }), id);
  assert.equal(oneSignalAppId({ EXPO_PUBLIC_ONESIGNAL_APP_ID: ` ${id.toUpperCase()} ` }), id);
  for (const bad of [undefined, "", "not-an-id", "<<ONESIGNAL_APP_ID>>"]) {
    assert.equal(oneSignalAppId({ EXPO_PUBLIC_ONESIGNAL_APP_ID: bad }), null, String(bad));
  }
});

test("Data and privacy discloses OneSignal only in builds where push is configured", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../app/data-privacy.tsx", import.meta.url), "utf8");
  assert.match(src, /\.\.\.\(oneSignalAppId\(\) \? \[NOTIFICATIONS\] : \[\]\)/);
  assert.match(src, /OneSignal/);
  assert.match(src, /only if you allow/i);
  assert.match(src, /never your name, phone number, location or reports/);
});
