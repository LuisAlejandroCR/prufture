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
  reportChecks,
  stageFor,
  type ConfirmationReport,
} from "../lib/confirmations.js";

const OWN = "d2g62"; // Bogotá cell of the real demo report
const row = (
  own: boolean,
  geohashRegion: string,
  membershipVerified: boolean,
  verifiedPerson: boolean | null = null,
  verifiedPersonDegraded: boolean | null = null,
): ConfirmationReport => ({
  own,
  geohashRegion,
  membershipVerified,
  verifiedPerson,
  verifiedPersonDegraded,
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
        { own: false, geohashRegion: OWN, verifiedPerson: false, verifiedPersonDegraded: true },
        { own: false, geohashRegion: OWN, verifiedPerson: "yes", verifiedPersonDegraded: "no" },
      ],
    }),
    [
      row(true, OWN, true),
      row(false, "d2g63", false),
      row(false, OWN, false),
      row(false, OWN, false, false, true),
      row(false, OWN, false),
    ],
  );
  assert.equal(parseConfirmations(null), null);
  assert.equal(parseConfirmations({ reports: "x" }), null);
  assert.equal(parseConfirmations([]), null);
});

const photo = (
  membership: "verified" | null,
  verifiedPerson: boolean | null = null,
  verifiedPersonDegraded: boolean | null = null,
) => ({ membership, verifiedPerson, verifiedPersonDegraded });

test("reportChecks: a photo shows its report's pass and face check, not only its own", () => {
  // Since #110 the pass is proven on one photo per report, and before #116 the face check went only
  // to the first photo: the shared link (newest photo) showed neither.
  const report = [row(true, OWN, true, true, false), row(false, OWN, false)];
  assert.deepEqual(reportChecks(photo(null), report), {
    membership: "verified",
    verifiedPerson: true,
    verifiedPersonDegraded: false,
  });
});

test("reportChecks: without the route, or with no report verdict, the photo's own fields stand", () => {
  const own = photo("verified", false, true);
  assert.deepEqual(reportChecks(own, null), own);
  assert.deepEqual(reportChecks(own, []), own);
  assert.deepEqual(reportChecks(own, [row(true, OWN, false)]), own);
  // Another report's pass or face check never lends itself to this one.
  assert.deepEqual(reportChecks(photo(null), [row(false, OWN, true, true, false)]), photo(null));
});

test("parseConfirmations keeps a pass's round, and /verify never adds passes of different rounds", () => {
  const rows = parseConfirmations({
    reports: [
      { own: true, geohashRegion: "d2g62", membershipVerified: true, round: 0 },
      { own: false, geohashRegion: "d2g63", membershipVerified: true, round: 1 },
      { own: false, geohashRegion: "d2g63", membershipVerified: true, round: "1" },
    ],
  });
  assert.ok(rows);
  assert.deepEqual(rows.map((r) => r.round), [0, 1, undefined]);
  // Round 0 (own) and round 1 are possibly one member: one counts. The junk round reads as 0.
  assert.equal(nearbyReportCount("d2g62", rows), 2);
  assert.equal(nearbyReportCount("d2g62", rows.slice(0, 2)), 1);
});
