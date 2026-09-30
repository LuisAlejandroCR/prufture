// confirmations.test.ts: the public /verify page says "confirmed" only for two nearby reports that
// each carry a verified programme pass. Many reports without a pass (one tester, one phone), a
// single report, or an unavailable route never do.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  NEARBY_KM,
  nearbyReportCount,
  parseConfirmations,
  regionDistanceKm,
  stageFor,
  type ConfirmationReport,
} from "../lib/confirmations.js";

const OWN = "d2g62"; // Bogotá cell of the real demo report
const row = (own: boolean, geohashRegion: string, membershipVerified: boolean): ConfirmationReport => ({
  own,
  geohashRegion,
  membershipVerified,
});

test("regionDistanceKm: same cell is 0, an adjacent cell is inside 5 km, another continent is not", () => {
  assert.equal(regionDistanceKm(OWN, OWN), 0);
  const adjacent = regionDistanceKm(OWN, "d2g63");
  assert.ok(adjacent !== null && adjacent > 0 && adjacent < NEARBY_KM, `adjacent = ${adjacent}`);
  const far = regionDistanceKm(OWN, "u6sce"); // Stockholm
  assert.ok(far !== null && far > 5000, `far = ${far}`);
  assert.equal(regionDistanceKm(OWN, "not a geohash!"), null);
  assert.equal(regionDistanceKm("", OWN), null);
});

test("regression: six reports with no programme pass (the demo data) are never confirmed", () => {
  const demo = [row(true, OWN, false), ...Array.from({ length: 5 }, () => row(false, OWN, false))];
  assert.equal(nearbyReportCount(OWN, demo), 0);
  assert.equal(stageFor(nearbyReportCount(OWN, demo), 1), "waiting");
});

test("nearbyReportCount: only pass-confirmed reports count; far and unreadable regions never do", () => {
  assert.equal(nearbyReportCount(OWN, [row(true, OWN, true)]), 1);
  assert.equal(
    nearbyReportCount(OWN, [
      row(true, OWN, true),
      row(false, OWN, true),
      row(false, "d2g63", true),
      row(false, OWN, false), // nearby but no pass
      row(false, "u6sce", true), // pass but far
      row(false, "", true), // pass but unreadable region
    ]),
    3,
  );
  // The own report without a pass does not count, a passed neighbour still does.
  assert.equal(nearbyReportCount(OWN, [row(true, OWN, false), row(false, OWN, true)]), 1);
  assert.equal(nearbyReportCount(OWN, []), 0);
});

test("stageFor: confirmed only with two pass-confirmed reports; otherwise falls back to the anchor", () => {
  assert.equal(stageFor(2, 1), "confirmed");
  assert.equal(stageFor(3, 0), "confirmed");
  assert.equal(stageFor(1, 1), "waiting");
  assert.equal(stageFor(0, 1), "waiting");
  assert.equal(stageFor(1, 0), "received");
  // Route unavailable: never claim confirmed, however many on-chain attesters there are.
  assert.equal(stageFor(null, 1), "waiting");
  assert.equal(stageFor(null, 5), "waiting");
  assert.equal(stageFor(null, 0), "received");
});

test("parseConfirmations: keeps well-formed rows; a missing pass field reads as false", () => {
  assert.deepEqual(
    parseConfirmations({
      reports: [
        { own: true, geohashRegion: OWN, verifiedPerson: null, membershipVerified: true },
        { own: "yes", geohashRegion: OWN },
        { own: false },
        null,
        { own: false, geohashRegion: "d2g63", extra: "dropped" },
        { own: false, geohashRegion: OWN, membershipVerified: "true" },
      ],
    }),
    [row(true, OWN, true), row(false, "d2g63", false), row(false, OWN, false)],
  );
  assert.equal(parseConfirmations(null), null);
  assert.equal(parseConfirmations({ reports: "x" }), null);
  assert.equal(parseConfirmations([]), null);
});
