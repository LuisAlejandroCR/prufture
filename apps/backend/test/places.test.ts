// places.test.ts: area naming from a coarse region ("Near Bogotá"), the live task ids that used to
// fall into "Other", and place-aware report search. Regions are the real cells in the demo index.

import { test } from "node:test";
import assert from "node:assert/strict";
import { activityLabel, applyReportFilters, needsSecondText, programmeName } from "../lib/dashboard.js";
import { foldText, placeFor, placeLabel } from "../lib/places.js";
import type { ProofSummary } from "../lib/api.js";

test("placeFor names a cell after the nearest listed city", () => {
  assert.equal(placeFor("d2g62")?.name, "Bogotá");
  assert.equal(placeFor("u6sce")?.name, "Stockholm");
  assert.equal(placeFor("9q8yy")?.name, "San Francisco");
});

test("placeFor leaves remote, empty and invalid cells unnamed", () => {
  assert.equal(placeFor("00000"), null); // South Pacific, far from any listed city
  assert.equal(placeFor(""), null);
  assert.equal(placeFor("ai!!!"), null);
  assert.equal(placeLabel(""), "");
  assert.equal(placeLabel("d2g62"), "Near Bogotá");
});

test("foldText drops accents and case", () => {
  assert.equal(foldText("Bogotá"), "bogota");
});

test("live task ids map to real programmes, not Other", () => {
  assert.equal(programmeName("handwashing-lima"), "Water and sanitation");
  assert.equal(programmeName("cold-chain-bogota"), "Health");
  assert.equal(programmeName("item:child-friendly-space"), "Child protection");
  assert.equal(programmeName("item:tree-planting"), "Climate and environment");
  assert.equal(programmeName("teacher-training"), "Education");
  assert.equal(programmeName("something-new"), "Other");
});

test("activityLabel drops the item: prefix", () => {
  assert.equal(activityLabel("item:tree-planting"), "Trees planted");
  assert.equal(activityLabel("item:child-friendly-space"), "Child-friendly space set up");
  assert.equal(activityLabel("item:well-cleaning"), "Well Cleaning");
});

test("report search matches the area's place name, accent-free", () => {
  const mk = (proofHash: string, geohashRegion: string): ProofSummary => ({
    proofHash,
    taskId: "solar-panel-install",
    geohashRegion,
    capturedAt: "2026-09-28T10:00:00Z",
    attestationCount: 0,
  });
  const list = [mk("a", "d2g62"), mk("b", "u6sce")];
  assert.deepEqual(applyReportFilters(list, { q: "bogota" }).map((p) => p.proofHash), ["a"]);
  assert.deepEqual(applyReportFilters(list, { q: "Stockholm" }).map((p) => p.proofHash), ["b"]);
  assert.deepEqual(applyReportFilters(list, { q: "d2g62" }).map((p) => p.proofHash), ["a"]);
});

test("the needs-second alert counts reports and areas, not activities", () => {
  const mk = (proofHash: string, geohashRegion: string): ProofSummary => ({
    proofHash,
    taskId: "solar-panel-install",
    geohashRegion,
    capturedAt: "2026-09-28T10:00:00Z",
    attestationCount: 1,
  });
  assert.equal(needsSecondText([mk("a", "d2g62")]), "1 report needs a second community report");
  assert.equal(needsSecondText([mk("a", "d2g62"), mk("b", "d2g62")]), "2 reports need a second community report");
  assert.equal(
    needsSecondText([mk("a", "d2g62"), mk("b", "u6sce"), mk("c", "u6sce")]),
    "3 reports in 2 areas need a second community report",
  );
});
