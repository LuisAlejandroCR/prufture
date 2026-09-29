// question-flow.test.ts: each question is its own stack screen, so the iOS edge swipe and the Back
// control land on the same place; editing from Review returns to that same Review instead of
// stacking a second one.

import { test } from "node:test";
import assert from "node:assert/strict";
import { afterQuestion, firstOpenQuestion, questionIndex } from "../src/question-flow.js";

test("questionIndex clamps the route param to a real question", () => {
  assert.equal(questionIndex(undefined, 3), 0);
  assert.equal(questionIndex("2", 3), 2);
  assert.equal(questionIndex("7", 3), 2);
  assert.equal(questionIndex("-1", 3), 0);
  assert.equal(questionIndex("x", 3), 0);
  assert.equal(questionIndex("1", 0), 0);
});

test("afterQuestion pushes the next question, then the area step", () => {
  assert.deepEqual(afterQuestion({ index: 0, total: 3, fromReview: false }), { kind: "question", index: 1 });
  assert.deepEqual(afterQuestion({ index: 2, total: 3, fromReview: false }), { kind: "location" });
});

test("afterQuestion returns to the existing Review when editing from it", () => {
  assert.deepEqual(afterQuestion({ index: 0, total: 3, fromReview: true }), { kind: "review" });
  assert.deepEqual(afterQuestion({ index: 2, total: 3, fromReview: true }), { kind: "review" });
});

test("firstOpenQuestion finds the first unanswered required question", () => {
  const qs = [
    { id: "a", required: true },
    { id: "b", required: false },
    { id: "c", required: true },
  ];
  assert.equal(firstOpenQuestion(qs, {}), 0);
  assert.equal(firstOpenQuestion(qs, { a: "Yes" }), 2);
  assert.equal(firstOpenQuestion(qs, { a: "Yes", c: "No" }), -1);
});
