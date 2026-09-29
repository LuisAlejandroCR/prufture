// report-check.test.ts: a report can be saved only when it is complete — every photo step taken,
// every required question answered, and the approximate area set. Review lists exactly what is
// missing (in flow order) and "Change" can reopen a specific question by its clamped index.

import { test } from "node:test";
import assert from "node:assert/strict";
import { missingItems, questionIndex } from "../src/report-check.js";
import { getTask } from "../src/tasks.js";

const task = getTask("solar-panel-install"); // 3 photos, 2 required questions

function draft(over: Partial<{ photos: { stepIndex: number }[]; answers: Record<string, string>; geohash: string }> = {}) {
  return { photos: [0, 1, 2].map((stepIndex) => ({ stepIndex })), answers: { "all-panels": "Yes", "lights-work": "Yes" }, geohash: "kzdwb", ...over };
}

test("a complete draft has nothing missing", () => {
  assert.deepEqual(missingItems(task, draft()), []);
});

test("missing photo, answer and area are listed in flow order", () => {
  const m = missingItems(task, draft({ photos: [{ stepIndex: 0 }, { stepIndex: 2 }], answers: { "all-panels": "Yes" }, geohash: "" }));
  assert.deepEqual(
    m.map((x) => x.kind),
    ["photo", "answer", "area"],
  );
  assert.equal(m[0]?.kind === "photo" && m[0].step, 1);
  assert.equal(m[1]?.kind === "answer" && m[1].index, 1);
});

test("no draft means everything is missing, never a crash", () => {
  assert.equal(missingItems(task, null).length, task.photos.length + task.questions.filter((q) => q.required).length + 1);
});

test("questionIndex clamps the route param into range", () => {
  assert.equal(questionIndex(undefined, 3), 0);
  assert.equal(questionIndex("2", 3), 2);
  assert.equal(questionIndex("9", 3), 2);
  assert.equal(questionIndex("-1", 3), 0);
  assert.equal(questionIndex("x", 3), 0);
  assert.equal(questionIndex("1", 0), 0);
});
