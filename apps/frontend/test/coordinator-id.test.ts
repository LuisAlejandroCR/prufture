// coordinator-id.test.ts: a subscriber who sees the sample inbox can read and share their own
// coordinator id, so the programme team can add them as staff without digging in RevenueCat.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { coordinatorIdMessage } from "../src/coordinator-id.js";

test("the share message carries the id and what to do with it, nothing else", () => {
  const msg = coordinatorIdMessage("$RCAnonymousID:abc123");
  assert.match(msg, /\$RCAnonymousID:abc123/);
  assert.match(msg, /programme team/i);
  assert.doesNotMatch(msg, /[0-9a-f]{64}|geohash|location/i, "no report reference or place travels with it");
});

test("the sample inbox shows the id selectable and offers to share it", () => {
  const screen = readFileSync(new URL("../app/coordinator.tsx", import.meta.url), "utf8");
  assert.match(screen, /Your coordinator id/);
  assert.match(screen, /selectable/);
  assert.match(screen, /Share\.share\(\{ message: coordinatorIdMessage\(/);
  assert.match(screen, /label="Share my id"/);
});
