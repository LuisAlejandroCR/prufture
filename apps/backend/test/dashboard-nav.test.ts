// dashboard-nav.test.ts: which dashboard section is marked current, what the narrow-screen
// More menu holds, and the menu's close behaviour (navigation, Escape, outside click).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MORE_LINKS, NAV_GROUPS, isActiveSection } from "../lib/dashboard-nav.js";

const SIDEBAR = readFileSync(new URL("../app/dashboard/Sidebar.tsx", import.meta.url), "utf8");

test("Overview is current only on /dashboard itself", () => {
  assert.equal(isActiveSection("/dashboard", "/dashboard"), true);
  assert.equal(isActiveSection("/dashboard/reports", "/dashboard"), false);
});

test("a section owns its sub-pages but not a sibling with the same prefix", () => {
  assert.equal(isActiveSection("/dashboard/reports", "/dashboard/reports"), true);
  assert.equal(isActiveSection("/dashboard/reports/abc123", "/dashboard/reports"), true);
  assert.equal(isActiveSection("/dashboard/mapping", "/dashboard/map"), false);
});

test("More holds every section outside the daily Workspace group, once each", () => {
  const workspace = NAV_GROUPS[0].links.map((l) => l.href);
  assert.deepEqual(workspace, ["/dashboard", "/dashboard/reports", "/dashboard/alerts"]);
  const more = MORE_LINKS.map((l) => l.href);
  assert.deepEqual(more, [
    "/dashboard/programmes",
    "/dashboard/communities",
    "/dashboard/map",
    "/dashboard/exports",
    "/dashboard/settings",
  ]);
  assert.equal(new Set(more).size, more.length);
});

test("the More menu closes on navigation, Escape and an outside click", () => {
  assert.match(SIDEBAR, /\[pathname\]/);
  assert.match(SIDEBAR, /"Escape"/);
  assert.match(SIDEBAR, /pointerdown/);
  assert.doesNotMatch(SIDEBAR, /<summary[^>]*>\s*<Icon name="settings"/);
});
