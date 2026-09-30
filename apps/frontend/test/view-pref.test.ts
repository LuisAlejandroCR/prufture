// view-pref.test.ts: Missions remembers List or Map across launches (audit: default List, remember
// the reporter's choice), falls back to List on anything unexpected, never throws when storage fails,
// and the bundled assignments are flagged as examples so the screen can say so.

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { __setViewStore, loadMissionsView, parseView, saveMissionsView } from "../src/view-pref.js";
import { EXAMPLE_ASSIGNMENTS, listTasks } from "../src/tasks.js";

let mem = new Map<string, string>();
beforeEach(() => {
  mem = new Map();
  __setViewStore({
    async getItemAsync(k) {
      return mem.get(k) ?? null;
    },
    async setItemAsync(k, v) {
      mem.set(k, v);
    },
  });
});

test("parseView accepts only list or map", () => {
  assert.equal(parseView("map"), "map");
  assert.equal(parseView("list"), "list");
  assert.equal(parseView(null), "list");
  assert.equal(parseView("satellite"), "list");
});

test("the chosen view round-trips", async () => {
  assert.equal(await loadMissionsView(), "list");
  await saveMissionsView("map");
  assert.equal(await loadMissionsView(), "map");
});

test("a failing store never throws and keeps List", async () => {
  __setViewStore({
    async getItemAsync() {
      throw new Error("keychain locked");
    },
    async setItemAsync() {
      throw new Error("keychain locked");
    },
  });
  await saveMissionsView("map");
  assert.equal(await loadMissionsView(), "list");
});

test("bundled assignments are marked as examples", () => {
  assert.equal(EXAMPLE_ASSIGNMENTS, true);
  assert.ok(listTasks().length > 0);
});
