// feedback.test.ts: the haptics helpers must never break the report flow, the
// enabled flag must gate them, and celebrationsAllowed() must fold in both the
// reporter toggle and the OS reduce-motion setting. Pure: no device, no expo
// native module resolves under node, which is itself part of the contract.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MOMENT_SAVED_MS,
  MOMENT_SENT_MS,
  MOMENT_IDENTITY_MS,
  tap,
  bump,
  thud,
  success,
  warn,
  celebrationsAllowed,
  setHapticsEnabled,
  setCelebrationsEnabled,
  __setHapticsForTest,
  __setReduceMotionForTest,
  __resetFeedbackForTest,
} from "../src/feedback.js";

test("timing constants are exported", () => {
  assert.equal(MOMENT_SAVED_MS, 2000);
  assert.equal(MOMENT_SENT_MS, 2500);
  assert.equal(MOMENT_IDENTITY_MS, 1500);
});

test("helpers are no-ops (never throw) when the haptic module is absent", async () => {
  __resetFeedbackForTest();
  __setHapticsForTest(null);
  await assert.doesNotReject(Promise.all([tap(), bump(), thud(), success(), warn()]));
});

test("helpers swallow a throwing haptic module", async () => {
  __resetFeedbackForTest();
  __setHapticsForTest({
    impactAsync: async () => {
      throw new Error("no haptic engine");
    },
    notificationAsync: async () => {
      throw new Error("no haptic engine");
    },
    ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy" } as never,
    NotificationFeedbackType: { Success: "success", Warning: "warning" } as never,
  });
  await assert.doesNotReject(Promise.all([tap(), thud(), success(), warn()]));
  __setHapticsForTest(null);
});

test("hapticsEnabled = false suppresses the calls; true lets them through", async () => {
  __resetFeedbackForTest();
  let impacts = 0;
  let notifications = 0;
  __setHapticsForTest({
    impactAsync: async () => {
      impacts += 1;
    },
    notificationAsync: async () => {
      notifications += 1;
    },
    ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy" } as never,
    NotificationFeedbackType: { Success: "success", Warning: "warning" } as never,
  });

  await setHapticsEnabled(false);
  await tap();
  await success();
  assert.equal(impacts, 0);
  assert.equal(notifications, 0);

  await setHapticsEnabled(true);
  await tap();
  await success();
  assert.equal(impacts, 1);
  assert.equal(notifications, 1);

  __setHapticsForTest(null);
});

test("celebrationsAllowed() is false under reduce-motion OR toggle-off, true otherwise", async () => {
  __resetFeedbackForTest();

  __setReduceMotionForTest(() => false);
  await setCelebrationsEnabled(true);
  assert.equal(await celebrationsAllowed(), true);

  await setCelebrationsEnabled(false);
  assert.equal(await celebrationsAllowed(), false);

  await setCelebrationsEnabled(true);
  __setReduceMotionForTest(() => true);
  assert.equal(await celebrationsAllowed(), false);

  __resetFeedbackForTest();
});
