// geohash.test.ts: unit vectors, fuzz, and invariants for the coarse geohash encoder.

import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeGeohashBounds, encodeGeohash } from "./geohash.js";

const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";

// --- unit vectors (locked against this implementation) ---
test("known coordinates encode to expected cells", () => {
  assert.equal(encodeGeohash(59.3326, 18.0649, 5), "u6sce"); // Stockholm
  assert.equal(encodeGeohash(0, 0, 5), "s0000");
  assert.equal(encodeGeohash(-90, -180, 5), "00000");
  assert.equal(encodeGeohash(90, 180, 5), "zzzzz");
});

test("precision controls length and is prefix-stable", () => {
  const p7 = encodeGeohash(59.3326, 18.0649, 7);
  assert.equal(p7.length, 7);
  for (let n = 1; n < 7; n += 1) {
    assert.equal(encodeGeohash(59.3326, 18.0649, n), p7.slice(0, n));
  }
});

// --- fuzz ---
test("fuzz: output is always well-formed and contains the point", () => {
  for (let i = 0; i < 5000; i += 1) {
    const lat = Math.random() * 180 - 90;
    const lng = Math.random() * 360 - 180;
    const precision = 1 + Math.floor(Math.random() * 9);
    const hash = encodeGeohash(lat, lng, precision);

    assert.equal(hash.length, precision, `len for (${lat},${lng})`);
    for (const c of hash) assert.ok(BASE32.includes(c), `charset: ${c}`);

    const b = decodeGeohashBounds(hash);
    assert.ok(lat >= b.latMin && lat <= b.latMax, `lat ${lat} in [${b.latMin},${b.latMax}]`);
    assert.ok(lng >= b.lngMin && lng <= b.lngMax, `lng ${lng} in [${b.lngMin},${b.lngMax}]`);
  }
});

// --- invariants ---
test("invariant: 5-char cell is coarse (never pinpoints the volunteer)", () => {
  for (let i = 0; i < 1000; i += 1) {
    const lat = Math.random() * 180 - 90;
    const lng = Math.random() * 360 - 180;
    const b = decodeGeohashBounds(encodeGeohash(lat, lng, 5));
    assert.ok(b.latMax - b.latMin > 0.01, "lat span keeps location coarse");
    assert.ok(b.lngMax - b.lngMin > 0.01, "lng span keeps location coarse");
  }
});

test("invariant: re-encoding a cell centre returns the same cell", () => {
  for (let i = 0; i < 1000; i += 1) {
    const lat = Math.random() * 170 - 85;
    const lng = Math.random() * 350 - 175;
    const h1 = encodeGeohash(lat, lng, 6);
    const b = decodeGeohashBounds(h1);
    assert.equal(encodeGeohash((b.latMin + b.latMax) / 2, (b.lngMin + b.lngMax) / 2, 6), h1);
  }
});

test("decode rejects invalid characters", () => {
  assert.throws(() => decodeGeohashBounds("ail"), /invalid geohash char/);
});
