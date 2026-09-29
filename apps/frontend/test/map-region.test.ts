// map-region.test.ts: where the map opens. With the reporter's approximate area known it centres on
// that area at city zoom (never a world view), and with no area it fits only the nearest cells, so
// tasks on other continents can never zoom the map out to the whole planet.

import { test } from "node:test";
import assert from "node:assert/strict";
import { encodeGeohash } from "../src/geohash.js";
import { CITY_DELTA, mapRegion } from "../src/map-region.js";
import { cellCentre } from "../src/tasks.js";

const bogota = encodeGeohash(4.711, -74.0721, 5);
const lima = encodeGeohash(-12.0464, -77.0428, 5);
const nairobi = encodeGeohash(-1.2921, 36.8219, 5);

test("focus cell: centred on the reporter's area at city zoom", () => {
  const r = mapRegion([bogota, lima, nairobi], bogota);
  assert.ok(r);
  const c = cellCentre(bogota);
  assert.ok(Math.abs(r.latitude - c.latitude) < 1e-9);
  assert.ok(Math.abs(r.longitude - c.longitude) < 1e-9);
  assert.equal(r.latitudeDelta, CITY_DELTA);
  assert.equal(r.longitudeDelta, CITY_DELTA);
});

test("a city centre overrides the cell centre when geocoding found one", () => {
  const r = mapRegion([bogota], bogota, { latitude: 4.6, longitude: -74.08 });
  assert.equal(r?.latitude, 4.6);
  assert.equal(r?.longitude, -74.08);
});

test("no focus: cells far apart never produce a continent-wide view", () => {
  const r = mapRegion([bogota, lima, nairobi], null);
  assert.ok(r);
  assert.ok(r.latitudeDelta <= 2, `latitudeDelta ${r.latitudeDelta} is not city or region scale`);
  assert.ok(r.longitudeDelta <= 2);
});

test("no focus, one cell: city zoom on that cell", () => {
  const r = mapRegion([lima], null);
  assert.equal(r?.latitudeDelta, CITY_DELTA);
});

test("nothing to show: no region", () => {
  assert.equal(mapRegion([], null), undefined);
});
