// items-tasks.test.ts: the field item catalog and the task resolver built on it. Locks the shape a
// reporter relies on (photos, questions, privacy hints), self-started `item:` ids, the legacy
// assignment ids already stored on phones, and distance sorting from an approximate cell.

import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_TASK_ID_LEN } from "@proof/core";
import { encodeGeohash } from "../src/geohash.js";
import { CATEGORIES, ITEMS, itemsByCategory, searchItems } from "../src/items.js";
import {
  SELF_STARTED_AREA,
  cellDistanceKm,
  distanceLabel,
  getTask,
  itemTaskId,
  listTasks,
  recommendedTask,
  sortByDistance,
} from "../src/tasks.js";

test("catalog covers every programme area with at least 12 items", () => {
  assert.ok(ITEMS.length >= 12);
  for (const c of CATEGORIES) assert.ok(ITEMS.some((i) => i.category === c), `no item for ${c}`);
});

test("every item is capturable: unique id, 1-3 photos with hints, closed questions", () => {
  const ids = new Set<string>();
  for (const item of ITEMS) {
    assert.ok(!ids.has(item.id), `duplicate id ${item.id}`);
    ids.add(item.id);
    assert.ok(item.photos.length >= 1 && item.photos.length <= 3, item.id);
    for (const p of item.photos) assert.ok(p.hint, `${item.id} photo "${p.prompt}" has no privacy hint`);
    assert.ok(item.questions.length >= 1 && item.questions.length <= 2, item.id);
    for (const q of item.questions) assert.ok(q.options.length >= 2, `${item.id}/${q.id}`);
    assert.ok(itemTaskId(item.id).length <= MAX_TASK_ID_LEN, `${item.id} taskId too long for /sync`);
  }
});

test("searchItems matches name, action and category, case-insensitive", () => {
  assert.ok(searchItems("PUMP").some((i) => i.id === "water-point"));
  assert.ok(searchItems("fridge").some((i) => i.id === "vaccine-fridge"));
  assert.equal(searchItems("child protection").length, ITEMS.filter((i) => i.category === "Child protection").length);
  assert.equal(searchItems("   ").length, ITEMS.length);
  assert.equal(searchItems("zzz-no-match").length, 0);
});

test("itemsByCategory keeps catalog order and drops empty groups", () => {
  const groups = itemsByCategory(searchItems("fridge"));
  assert.deepEqual(groups.map((g) => g.category), ["Health"]);
  assert.deepEqual(itemsByCategory().map((g) => g.category), CATEGORIES);
});

test("a self-started item report takes its content from the item and no hardcoded place", () => {
  const t = getTask(itemTaskId("water-point"));
  assert.equal(t.id, "item:water-point");
  assert.equal(t.itemId, "water-point");
  assert.equal(t.selfStarted, true);
  assert.equal(t.area, SELF_STARTED_AREA);
  assert.equal(t.cell, "");
  assert.equal(t.category, "Water and sanitation");
});

test("legacy assignment ids stored on phones still resolve to their original titles", () => {
  assert.equal(getTask("solar-panel-install").title, "Check solar panels at Kalama Primary School");
  assert.equal(getTask("water-pump-repair").itemId, "water-point");
  assert.equal(getTask("latrine-construction").itemId, "toilets");
});

test("legacy question ids survive, so answers in drafts saved before the catalog still resume", () => {
  const ids = (id: string) => getTask(id).questions.map((q) => q.id);
  assert.deepEqual(ids("solar-panel-install"), ["all-panels", "lights-work"]);
  assert.deepEqual(ids("water-pump-repair"), ["water-flows"]);
  assert.ok(ids("latrine-construction").includes("usable"));
});

test("unknown ids fall back to a generic report instead of throwing", () => {
  const t = getTask("item:does-not-exist");
  assert.equal(t.title, "Field report");
  assert.equal(getTask("").id, "unknown");
});

test("every assignment has a valid 5-char cell and a catalog item", () => {
  for (const t of listTasks()) {
    assert.match(t.cell, /^[0-9bcdefghjkmnpqrstuvwxyz]{5}$/, t.id);
    assert.notEqual(t.title, "Field report", `${t.id} points at a missing item`);
    assert.equal(t.selfStarted, false);
  }
});

test("distance sorting puts the nearest assignment first; unknown cell keeps order", () => {
  const bogota = encodeGeohash(4.65, -74.1, 5);
  assert.equal(sortByDistance(listTasks(), bogota)[0]?.id, "cold-chain-bogota");
  assert.equal(recommendedTask(bogota).id, "cold-chain-bogota");
  const nairobi = encodeGeohash(-1.29, 36.82, 5);
  assert.equal(recommendedTask(nairobi).id, "solar-panel-install");
  assert.deepEqual(sortByDistance(listTasks(), null).map((t) => t.id), listTasks().map((t) => t.id));
});

test("cellDistanceKm is symmetric and roughly right (Stockholm to Oslo ~ 415 km)", () => {
  const sthlm = encodeGeohash(59.3326, 18.0649, 5);
  const oslo = encodeGeohash(59.9139, 10.7522, 5);
  const km = cellDistanceKm(sthlm, oslo);
  assert.ok(km > 395 && km < 435, `${km}`);
  assert.equal(cellDistanceKm(oslo, sthlm), km);
  assert.equal(cellDistanceKm(sthlm, sthlm), 0);
});

test("distanceLabel speaks in plain words and stays silent without a cell", () => {
  const task = getTask("cold-chain-bogota");
  assert.equal(distanceLabel(task.cell, task), "Nearby");
  assert.equal(distanceLabel(encodeGeohash(59.33, 18.06, 5), task), "Far from you");
  assert.match(distanceLabel(encodeGeohash(4.2, -74.0, 5), task) ?? "", /^\d+ km away$/);
  assert.equal(distanceLabel(null, task), null);
  assert.equal(distanceLabel(task.cell, getTask(itemTaskId("handwashing"))), null);
});
