// announce.test.ts: what VoiceOver says when something changes without a screen change. iOS ignores
// accessibilityLiveRegion (Android only), so these go through announceForAccessibilityWithOptions:
// failures interrupt (high), progress queues behind current speech, background news never interrupts.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  announce,
  connectivityChange,
  failure,
  gesturePrompt,
  photoTaken,
  stageSpoken,
  syncResult,
  __setAnnouncerForTest,
} from "../src/announce.js";

const summary = (s: Partial<{ attempted: number; synced: number; attested: number; failed: number }>) => ({
  attempted: 0,
  synced: 0,
  attested: 0,
  failed: 0,
  ...s,
});

test("photoTaken names the step and the two choices", () => {
  const a = photoTaken(0, 3);
  assert.equal(a.text, "Photo 1 of 3 taken. Use photo, or take again.");
  assert.equal(a.priority, "default");
});

test("gesturePrompt reads the movement and its position, queued so prompts never cut each other off", () => {
  const a = gesturePrompt(1, 3, "Slowly turn your head left");
  assert.equal(a.text, "Movement 2 of 3. Slowly turn your head left.");
  assert.equal(a.queue, true);
});

test("failure interrupts at high priority", () => {
  const a = failure("The report could not be saved on this phone. Please try again.");
  assert.equal(a.priority, "high");
  assert.equal(a.queue, false);
});

test("connectivityChange speaks only on a real change, never on the first reading", () => {
  assert.equal(connectivityChange(null, true), null);
  assert.equal(connectivityChange(null, false), null);
  assert.equal(connectivityChange(true, true), null);
  assert.match(connectivityChange(true, false)!.text, /^Offline\. Reports are saved on this phone/);
  assert.match(connectivityChange(false, true)!.text, /^Back online\./);
  assert.equal(connectivityChange(true, false)!.priority, "low");
});

test("syncResult: a background run speaks only good news and never errors", () => {
  assert.equal(syncResult(summary({}), false), null);
  assert.equal(syncResult(summary({ attempted: 2, failed: 2 }), false), null);
  assert.equal(syncResult(summary({ attempted: 2, synced: 2 }), false)!.text, "Your saved reports were sent.");
  assert.equal(syncResult(summary({ attested: 1 }), false)!.text, "A report was recorded publicly.");
  assert.equal(syncResult(summary({ attested: 3 }), false)!.text, "3 reports were recorded publicly.");
});

test("syncResult: a check the reporter asked for always gets an answer", () => {
  assert.equal(syncResult(summary({}), true)!.text, "Checked. No new updates.");
  const unreachable = syncResult(summary({ attempted: 2, failed: 2 }), true)!;
  assert.match(unreachable.text, /Could not reach the programme\. Your reports are safe on this phone/);
  assert.equal(unreachable.priority, "high");
  assert.equal(syncResult(summary({ attempted: 1, synced: 1, attested: 1 }), true)!.text, "Your saved reports were sent. A report was recorded publicly.");
});

test("stageSpoken states what colour alone showed: done, current or not yet", () => {
  const base = { label: "Sent to programme", detail: "It reached the programme team." };
  assert.equal(stageSpoken({ ...base, done: true, current: false }), "Sent to programme. Done. It reached the programme team.");
  assert.equal(stageSpoken({ ...base, done: false, current: true }), "Sent to programme. Current step. It reached the programme team.");
  assert.equal(stageSpoken({ ...base, done: false, current: false }), "Sent to programme. Not yet. It reached the programme team.");
});

test("announce uses the iOS options API when present, falls back, and swallows a missing module", async () => {
  const calls: unknown[][] = [];
  __setAnnouncerForTest({ announceForAccessibilityWithOptions: (t: string, o: unknown) => calls.push(["opts", t, o]) });
  await announce(photoTaken(0, 1));
  assert.deepEqual(calls[0], ["opts", "Photo 1 of 1 taken. Use photo, or take again.", { queue: true, priority: "default" }]);
  __setAnnouncerForTest({ announceForAccessibility: (t: string) => calls.push(["plain", t]) });
  await announce(failure("x"));
  assert.deepEqual(calls[1], ["plain", "x"]);
  await announce(null);
  assert.equal(calls.length, 2);
  __setAnnouncerForTest({});
  await assert.doesNotReject(announce(failure("y")));
  __setAnnouncerForTest(null);
});
