// pitch.test.ts: unit + invariant tests for the /pitch deck paging helpers.
// Proves: wrapIndex always lands in-range and is a pure modulo wrap; pageFromKey maps
// only the intended keys and ignores everything else.

import { test } from "node:test";
import assert from "node:assert/strict";
import { pageFromKey, wrapIndex } from "../app/pitch/nav.js";

test("wrapIndex: unit vectors over a 9-slide deck", () => {
  assert.equal(wrapIndex(0, 9), 0);
  assert.equal(wrapIndex(8, 9), 8);
  assert.equal(wrapIndex(9, 9), 0);
  assert.equal(wrapIndex(-1, 9), 8);
  assert.equal(wrapIndex(-9, 9), 0);
  assert.equal(wrapIndex(20, 9), 2);
});

test("wrapIndex: empty deck never divides by zero", () => {
  assert.equal(wrapIndex(3, 0), 0);
  assert.equal(wrapIndex(-3, 0), 0);
});

test("invariant (fuzz): wrapIndex output is always a valid index", () => {
  for (let i = 0; i < 5000; i++) {
    const len = 1 + Math.floor(Math.random() * 12);
    const n = Math.floor((Math.random() - 0.5) * 200);
    const r = wrapIndex(n, len);
    assert.ok(Number.isInteger(r));
    assert.ok(r >= 0 && r < len);
    assert.equal(r, ((n % len) + len) % len);
  }
});

test("pageFromKey: recognised keys map, others are null", () => {
  assert.equal(pageFromKey("ArrowRight"), "next");
  assert.equal(pageFromKey("ArrowDown"), "next");
  assert.equal(pageFromKey(" "), "next");
  assert.equal(pageFromKey("ArrowLeft"), "prev");
  assert.equal(pageFromKey("ArrowUp"), "prev");
  assert.equal(pageFromKey("Home"), "first");
  assert.equal(pageFromKey("End"), "last");
  assert.equal(pageFromKey("a"), null);
  assert.equal(pageFromKey("Enter"), null);
  assert.equal(pageFromKey("Escape"), null);
});
