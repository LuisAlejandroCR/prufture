// coverage.test.ts: unit tests for the coverage-map data layer — geohash cell decode
// and the coverage() aggregation. Proves the map only ever works with coarse cells and
// that undecodable regions are dropped rather than guessed at.

import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeGeohashBounds, geohashCenter } from "../lib/geohash.js";
import { coverage } from "../lib/dashboard.js";
import type { ProofSummary } from "../lib/api.js";

test("decodeGeohashBounds: known 1-char vector 's' -> lat 0..45, lng 0..45", () => {
  const b = decodeGeohashBounds("s");
  assert.deepEqual(b, { minLat: 0, maxLat: 45, minLng: 0, maxLng: 45 });
});

test("decodeGeohashBounds: 5-char cell is small and contains its reference point", () => {
  // "9q8yy" is the ~2.4 km cell around downtown San Francisco (37.75, -122.42).
  const b = decodeGeohashBounds("9q8yy");
  assert.ok(b);
  if (!b) return;
  assert.ok(b.maxLat - b.minLat < 0.1 && b.maxLng - b.minLng < 0.1);
  assert.ok(b.minLat < 37.75 && 37.75 < b.maxLat);
  assert.ok(b.minLng < -122.42 && -122.42 < b.maxLng);
});

test("geohashCenter: 's' midpoint is (22.5, 22.5)", () => {
  assert.deepEqual(geohashCenter("s"), { lat: 22.5, lng: 22.5 });
});

test("decode helpers: empty / invalid input -> null", () => {
  assert.equal(decodeGeohashBounds(""), null);
  assert.equal(decodeGeohashBounds("a"), null); // 'a' is not a geohash base-32 char
  assert.equal(decodeGeohashBounds("il0"), null); // 'i','l' excluded from the alphabet
  assert.equal(geohashCenter(""), null);
});

function proof(region: string, attestationCount = 0): ProofSummary {
  return {
    proofHash: `${region}-${Math.random()}`,
    taskId: "solar-panel-install",
    geohashRegion: region,
    capturedAt: "2026-09-07T10:00:00.000Z",
    attestationCount,
  };
}

test("coverage: groups 3 reports in one region into one cell of count 3, drops undecodable, counts confirmed", () => {
  const cells = coverage([
    proof("s0000", 2), // confirmed (attestationCount >= 2)
    proof("s0000", 0),
    proof("s0000", 1),
    proof("il000"), // undecodable region -> dropped
    proof(""), // empty region -> dropped
  ]);

  assert.equal(cells.length, 1);
  assert.equal(cells[0].region, "s0000");
  assert.equal(cells[0].count, 3);
  assert.equal(cells[0].confirmed, 1);
  assert.ok(cells[0].bounds && typeof cells[0].lat === "number");
});

test("coverage: multiple regions are sorted by report count descending", () => {
  const cells = coverage([proof("s0000"), proof("u0000"), proof("u0000"), proof("u0000"), proof("s0000")]);
  assert.equal(cells.length, 2);
  assert.equal(cells[0].region, "u0000");
  assert.equal(cells[0].count, 3);
  assert.equal(cells[1].count, 2);
});
