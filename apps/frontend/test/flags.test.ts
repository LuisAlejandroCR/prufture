// flags.test.ts: the identity-step feature flag and the default post-permissions nav path.
// Asserts the default journey (flag unset/off) never routes through the identity screen and
// therefore never reaches submitLiveness / sends a face frame.

import { test } from "node:test";
import assert from "node:assert/strict";
import { identityStepEnabled, nextAfterPermissions } from "../src/flags.js";

function withEnv(value: string | undefined, fn: () => void): void {
  const prev = process.env.EXPO_PUBLIC_IDENTITY_STEP;
  if (value === undefined) delete process.env.EXPO_PUBLIC_IDENTITY_STEP;
  else process.env.EXPO_PUBLIC_IDENTITY_STEP = value;
  try {
    fn();
  } finally {
    if (prev === undefined) delete process.env.EXPO_PUBLIC_IDENTITY_STEP;
    else process.env.EXPO_PUBLIC_IDENTITY_STEP = prev;
  }
}

test("identityStepEnabled: false when unset, false when 'off', true only for exactly 'on'", () => {
  withEnv(undefined, () => assert.equal(identityStepEnabled(), false));
  withEnv("off", () => assert.equal(identityStepEnabled(), false));
  withEnv("ON", () => assert.equal(identityStepEnabled(), false));
  withEnv("on", () => assert.equal(identityStepEnabled(), true));
});

test("nextAfterPermissions: default journey (flag off) goes straight to capture, never identity", () => {
  withEnv(undefined, () => {
    const target = nextAfterPermissions("task-1");
    assert.equal(target.pathname, "/report/capture");
    assert.notEqual(target.pathname, "/report/identity");
    assert.deepEqual(target.params, { id: "task-1", step: "0" });
  });
});

test("nextAfterPermissions: flag on routes through the identity screen", () => {
  withEnv("on", () => {
    const target = nextAfterPermissions("task-1");
    assert.equal(target.pathname, "/report/identity");
  });
});
