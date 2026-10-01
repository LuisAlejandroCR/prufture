// clickable.test.ts: the rules that keep dashboard targets clickable — whole-row clicks and the
// minimum on-screen size of a coverage-map zone.

import { test } from "node:test";
import assert from "node:assert/strict";
import { rowClickAction } from "../lib/row-click.js";
import { ZONE_MARKER_MAX_PX, ZONE_MARKER_MIN_PX, zoneMarkerRadius } from "../lib/dashboard.js";

test("a plain click on a row opens it", () => {
  assert.equal(rowClickAction({ insideControl: false, selecting: false, newTab: false }), "go");
});

test("Ctrl/Cmd or middle click on a row opens a new tab", () => {
  assert.equal(rowClickAction({ insideControl: false, selecting: false, newTab: true }), "tab");
});

test("a click on an inner link or button is left to that control", () => {
  assert.equal(rowClickAction({ insideControl: true, selecting: false, newTab: false }), "none");
  assert.equal(rowClickAction({ insideControl: true, selecting: false, newTab: true }), "none");
});

test("selecting text in a row does not navigate", () => {
  assert.equal(rowClickAction({ insideControl: false, selecting: true, newTab: false }), "none");
});

test("every zone marker is at least a finger-sized target", () => {
  for (const [count, max] of [
    [1, 1],
    [1, 500],
    [0, 10],
    [3, 0],
    [Number.NaN, 4],
  ] as const) {
    assert.ok(zoneMarkerRadius(count, max) >= ZONE_MARKER_MIN_PX, `${count}/${max}`);
  }
});

test("zone markers grow with reports and never exceed the cap", () => {
  const small = zoneMarkerRadius(1, 40);
  const mid = zoneMarkerRadius(10, 40);
  const top = zoneMarkerRadius(40, 40);
  assert.ok(small < mid && mid < top);
  assert.equal(top, ZONE_MARKER_MAX_PX);
  assert.equal(zoneMarkerRadius(80, 40), ZONE_MARKER_MAX_PX);
});
