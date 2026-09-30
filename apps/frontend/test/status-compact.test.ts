// status-compact.test.ts: the report screen stays short. A compact stepper with one line for the
// current step, community confirmations as the stepper's last step (not a separate card), the
// programme pass as one line, one action (See public record), and pull to refresh instead of a
// "Check for updates" button. "Confirmed" follows the community count, never the public record alone.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const status = readFileSync(new URL("../app/status/[id].tsx", import.meta.url), "utf8");

test("stages come from the report plus the live community count", () => {
  assert.match(status, /reportStages\(group, community\)/);
  assert.match(status, /s\.short/, "the stepper shows short labels");
  assert.match(status, /current\.detail/, "only the current step is described");
});

test("the pill says confirmed for an assignment only when the community count is met", () => {
  assert.match(status, /task\.confirmations\s*\?\s*\(communityDone \? "confirmed" : "waiting"\)/);
});

test("one action, and refresh by pulling down", () => {
  assert.match(status, /onRefresh=\{checkNow\}/);
  assert.doesNotMatch(status, /label="Check for updates"/);
  assert.match(status, /label="See public record"/);
});

test("the programme pass is one line; its explanation sits under Technical details", () => {
  assert.match(status, /\{pass && passCopy \? \(/);
  assert.match(status, /showTech && passCopy \? /);
});
