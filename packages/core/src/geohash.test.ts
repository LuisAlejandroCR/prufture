// geohash.test.ts: the coarsening contract — what may be signed and what the api must reject.
// An over-precise or malformed cell must fail isCoarseGeohash rather than be silently trimmed.

import { test } from "node:test";
import assert from "node:assert/strict";
import { COARSE_GEOHASH_LEN, coarsenGeohash, isCoarseGeohash } from "./geohash.js";

test("coarsenGeohash trims a precise cell to the coarse length", () => {
  assert.equal(coarsenGeohash("u4pruydqqvj"), "u4pru");
  assert.equal(coarsenGeohash("u4pru"), "u4pru");
  assert.equal(coarsenGeohash("u4p"), "u4p");
  assert.equal(COARSE_GEOHASH_LEN, 5);
});

test("coarsenGeohash lowercases so one cell has one spelling", () => {
  assert.equal(coarsenGeohash("U4PRUYD"), "u4pru");
});

test("coarsenGeohash is idempotent", () => {
  const once = coarsenGeohash("9q8yyk8yuv");
  assert.equal(coarsenGeohash(once), once);
});

test("isCoarseGeohash accepts 1..5 valid chars", () => {
  for (const ok of ["u", "u4", "u4p", "u4pr", "u4pru", "9q8yy"]) {
    assert.equal(isCoarseGeohash(ok), true, ok);
  }
});

test("isCoarseGeohash rejects an over-precise cell", () => {
  assert.equal(isCoarseGeohash("u4pruyd"), false);
  assert.equal(isCoarseGeohash("u4pruydqqvj"), false);
  assert.equal(isCoarseGeohash("b".repeat(50)), false);
});

test("isCoarseGeohash rejects empty and malformed input", () => {
  assert.equal(isCoarseGeohash(""), false);
  assert.equal(isCoarseGeohash("u4pri"), false); // 'a', 'i', 'l', 'o' are not in the base-32 geohash alphabet
  assert.equal(isCoarseGeohash("u4pra"), false);
  assert.equal(isCoarseGeohash("12.34"), false);
  assert.equal(isCoarseGeohash("U4PRU"), false); // callers coarsen (which lowercases) first
  assert.equal(isCoarseGeohash(undefined as unknown as string), false);
});
