// missions-reach.test.ts: a mission can be reported only from within REPORTABLE_KM of its area. Missions
// splits the list into "near you" (reportable) and "around the world" (view only); the task screen
// and the location step both refuse a far mission; self-started reports work anywhere.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { REPORTABLE_KM, getTask, itemTaskId, listTasks, missionReach, splitMissions } from "../src/tasks.js";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const BOGOTA_REPORTER = "d2g62"; // 14.7 km from the Bogotá mission cell d2g38
const bogota = getTask("cold-chain-bogota");
const kakuma = getTask("water-pump-repair");

test("reach: near within 25 km, far beyond, unknown without an area, anywhere for self-started", () => {
  assert.equal(REPORTABLE_KM, 25);
  assert.equal(missionReach(BOGOTA_REPORTER, bogota), "near");
  assert.equal(missionReach(BOGOTA_REPORTER, kakuma), "far");
  assert.equal(missionReach(null, bogota), "unknown");
  assert.equal(missionReach(BOGOTA_REPORTER, getTask(itemTaskId("vaccine-fridge"))), "anywhere");
  assert.equal(missionReach(null, getTask(itemTaskId("vaccine-fridge"))), "anywhere");
});

test("split: near missions first by distance; everything else goes around the world", () => {
  const { near, world } = splitMissions(listTasks(), BOGOTA_REPORTER);
  assert.deepEqual(near.map((t) => t.id), ["cold-chain-bogota"]);
  assert.equal(world.length, listTasks().length - 1);
  assert.ok(!world.some((t) => t.id === "cold-chain-bogota"));
  const unknown = splitMissions(listTasks(), null);
  assert.deepEqual(unknown.near, [], "without an area nothing can be reported yet");
  assert.equal(unknown.world.length, listTasks().length);
});

test("Missions shows two sections and never opens the report flow for a world mission", () => {
  const home = read("../app/(tabs)/index.tsx");
  assert.match(home, /Missions near you/);
  assert.match(home, /Missions around the world/);
  assert.match(home, /splitMissions\(listTasks\(\), cell\)/);
  assert.match(home, /router\.push\("\/report\/pick"\)/, "your own report stays available anywhere");
});

test("the task screen only offers Start report when the mission is reportable from here", () => {
  const task = read("../app/task/[id].tsx");
  assert.match(task, /missionReach\(cell, task\)/);
  assert.match(task, /reach === "near" \|\| reach === "anywhere"/);
  assert.match(task, /requestArea/, "an unknown area can be resolved from the task screen");
});

test("the location step refuses a far mission even if the flow was entered another way", () => {
  const location = read("../app/report/location.tsx");
  assert.match(location, /missionReach\(cell, task\) === "far"/);
  assert.match(location, /tooFar \? /);
});
