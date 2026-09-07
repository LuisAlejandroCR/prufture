// base64.test.ts: unit + fuzz round-trip for the camera base64 decoder.

import { test } from "node:test";
import assert from "node:assert/strict";
import { base64ToBytes } from "../src/base64.js";

test("decodes a known string", () => {
  assert.deepEqual([...base64ToBytes("aGVsbG8=")], [...Buffer.from("hello")]);
});

test("tolerates a data: URI prefix", () => {
  const raw = Buffer.from([0, 255, 16, 128, 7]);
  assert.deepEqual([...base64ToBytes(`data:image/jpeg;base64,${raw.toString("base64")}`)], [...raw]);
});

test("empty input -> empty bytes", () => {
  assert.equal(base64ToBytes("").length, 0);
});

test("fuzz: round-trips arbitrary byte arrays via a reference encoder", () => {
  for (let i = 0; i < 3000; i += 1) {
    const len = Math.floor(Math.random() * 512);
    const bytes = Buffer.from(Array.from({ length: len }, () => Math.floor(Math.random() * 256)));
    const decoded = base64ToBytes(bytes.toString("base64"));
    assert.equal(decoded.length, bytes.length);
    assert.deepEqual([...decoded], [...bytes]);
  }
});

test("invariant: decoding is deterministic", () => {
  const b64 = Buffer.from("proof-at-capture").toString("base64");
  assert.deepEqual([...base64ToBytes(b64)], [...base64ToBytes(b64)]);
});
