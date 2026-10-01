// nearby.test.ts: the community-confirmation rule the api and the public page share.

import { test } from "node:test";
import assert from "node:assert/strict";
import { cellDistanceKm, isCommunityConfirmed, NEARBY_KM, nearbyPassReportCount } from "./nearby.js";

const OWN = "d2g62"; // Bogotá
const NEXT_DOOR = "d2g63";
const FAR = "u6sce"; // Stockholm

test("cellDistanceKm: same cell 0, neighbour inside 5 km, another continent far, junk null", () => {
  assert.equal(cellDistanceKm(OWN, OWN), 0);
  const d = cellDistanceKm(OWN, NEXT_DOOR);
  assert.ok(d !== null && d > 0 && d < NEARBY_KM);
  assert.ok((cellDistanceKm(OWN, FAR) ?? 0) > 1000);
  assert.equal(cellDistanceKm(OWN, "not a geohash!"), null);
  assert.equal(cellDistanceKm("", OWN), null);
});

test("two pass-carrying reports nearby confirm, the judged one included", () => {
  const reports = [
    { own: true, geohashRegion: OWN, membershipVerified: true },
    { own: false, geohashRegion: NEXT_DOOR, membershipVerified: true },
  ];
  assert.equal(nearbyPassReportCount(OWN, reports), 2);
  assert.equal(isCommunityConfirmed(OWN, reports), true);
});

test("reports without a pass, far away or with a junk region never count", () => {
  const reports = [
    { own: true, geohashRegion: OWN, membershipVerified: true },
    { own: false, geohashRegion: NEXT_DOOR, membershipVerified: false },
    { own: false, geohashRegion: FAR, membershipVerified: true },
    { own: false, geohashRegion: "???", membershipVerified: true },
  ];
  assert.equal(nearbyPassReportCount(OWN, reports), 1);
  assert.equal(isCommunityConfirmed(OWN, reports), false);
});

test("a report without its own pass is confirmed by two other members nearby", () => {
  const reports = [
    { own: true, geohashRegion: OWN, membershipVerified: false },
    { own: false, geohashRegion: OWN, membershipVerified: true },
    { own: false, geohashRegion: NEXT_DOOR, membershipVerified: true },
  ];
  assert.equal(isCommunityConfirmed(OWN, reports), true);
});
