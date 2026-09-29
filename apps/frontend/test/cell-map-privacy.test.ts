// cell-map-privacy.test.ts: static privacy guard for the reporter map. Approximate geohash cells
// must be shown as tappable polygons without centre pins, which visually imply exact locations.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const SOURCE = readFileSync(new URL("../src/components/CellMap.tsx", import.meta.url), "utf8");

test("the map renders approximate areas without exact-looking centre markers", () => {
  assert.doesNotMatch(SOURCE, /\bMarker\b/);
  assert.doesNotMatch(SOURCE, /<Marker\b/);
  assert.match(SOURCE, /<Polygon\b/);
  assert.match(SOURCE, /tappable=\{!!c\.onPress\}/);
  assert.match(SOURCE, /onPress=\{c\.onPress\}/);
});
