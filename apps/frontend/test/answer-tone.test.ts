// answer-tone.test.ts: how a closed answer is shown. "Yes"-type answers read as working (sage check),
// "No"-type as needs attention (amber warning), and "could not confirm" / "not tested" stay neutral,
// so a reporter who could not check something is never shown a success tick. Also the saved-report count.

import { test } from "node:test";
import assert from "node:assert/strict";
import { answerTone, savedReportCount } from "../src/answer-tone.js";
import { ITEMS } from "../src/items.js";
import type { LocalProof } from "../src/queue-row.js";

test("positive, negative and unsure answers get distinct tones", () => {
  assert.equal(answerTone("Yes"), "good");
  assert.equal(answerTone("Yes, all"), "good");
  assert.equal(answerTone("No"), "bad");
  assert.equal(answerTone("Partly"), "bad");
  assert.equal(answerTone("No display"), "neutral");
  assert.equal(answerTone("Both"), "good");
  assert.equal(answerTone("Running low"), "bad");
  assert.equal(answerTone("I could not confirm"), "neutral");
  assert.equal(answerTone("Not tested"), "neutral");
});

test("every option in the catalog maps to a tone without throwing", () => {
  for (const item of ITEMS) for (const q of item.questions) for (const o of q.options) {
    assert.ok(["good", "bad", "neutral"].includes(answerTone(o)), `${item.id}: ${o}`);
  }
});

test("saved-report count counts reports, not photos", () => {
  const r = (id: string, reportId: string) => ({ id, reportId }) as LocalProof;
  assert.equal(savedReportCount([r("1", "A"), r("2", "A"), r("3", "A"), r("4", "B"), r("5", "")]), 3);
  assert.equal(savedReportCount([]), 0);
});
