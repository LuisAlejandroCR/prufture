// home.test.ts: the Missions home helpers — time-of-day greeting, the honest confirmed-report count
// (a report counts once, and only when every one of its photos is confirmed), mission row subtitles
// and the location line, which never claims more precision than "Nearby" or a rounded distance.

import { test } from "node:test";
import assert from "node:assert/strict";
import type { LocalProof } from "../src/queue-row.js";
import { confirmedReportCount, greeting, missionPlace, missionQuestion, nearMePrompt, showReachError } from "../src/home.js";
import { categoryIcon, getTask, itemTaskId, listTasks } from "../src/tasks.js";
import { CATEGORIES } from "../src/items.js";

function row(p: Partial<LocalProof>): LocalProof {
  return {
    id: "r",
    proofHash: "h",
    taskId: "water-pump-repair",
    geohash: "sb8v1",
    capturedAt: "2026-09-28T10:00:00Z",
    signature: "s",
    publicKey: "k",
    status: "pending_sync",
    mediaUri: "",
    attestationCount: 0,
    createdAt: "2026-09-28T10:00:00Z",
    reportId: "",
    ...p,
  } as LocalProof;
}

test("greeting follows the local hour", () => {
  assert.equal(greeting(5), "Good morning");
  assert.equal(greeting(11), "Good morning");
  assert.equal(greeting(12), "Good afternoon");
  assert.equal(greeting(17), "Good afternoon");
  assert.equal(greeting(18), "Good evening");
  assert.equal(greeting(2), "Good evening");
});

test("a multi-photo report counts once, and only when every photo is confirmed", () => {
  const rows = [
    row({ id: "a1", reportId: "A", status: "attested" }),
    row({ id: "a2", reportId: "A", status: "synced", attestationCount: 1 }),
    row({ id: "b1", reportId: "B", status: "attested" }),
    row({ id: "b2", reportId: "B", status: "synced", attestationCount: 0 }),
    row({ id: "c1", reportId: "C", status: "pending_sync" }),
    row({ id: "legacy", reportId: "", status: "attested" }),
  ];
  assert.equal(confirmedReportCount(rows), 2);
  assert.equal(confirmedReportCount([]), 0);
});

test("mission subtitle is the first closed question, falling back to the purpose", () => {
  const pump = getTask("water-pump-repair");
  assert.equal(missionQuestion(pump), pump.questions[0]?.text);
  const noQuestions = { ...pump, questions: [] };
  assert.equal(missionQuestion(noQuestions), pump.purpose);
});

test("mission place never invents precision", () => {
  const pump = getTask("water-pump-repair");
  assert.equal(missionPlace(pump, null), pump.area);
  assert.equal(missionPlace(pump, "Nearby"), "Nearby area");
  assert.equal(missionPlace(pump, "12 km away"), `${pump.area} · 12 km away`);
  assert.equal(missionPlace(pump, "Far from you"), `${pump.area} · Far from you`);
});

test("every category has an icon, so no mission row renders a blank circle", () => {
  for (const c of CATEGORIES) assert.ok(categoryIcon[c], `no icon for ${c}`);
  for (const t of [...listTasks(), getTask(itemTaskId("water-point"))]) assert.ok(categoryIcon[t.category]);
});

test("server notice: only online, only while reports wait, only when every send failed", () => {
  const base = { online: true, pending: 2, synced: 0, failed: 2 };
  assert.equal(showReachError(base), true);
  assert.equal(showReachError({ ...base, online: false }), false, "offline is the Offline pill's job");
  assert.equal(showReachError({ ...base, pending: 0 }), false, "nothing waiting: nothing to warn about");
  assert.equal(showReachError({ ...base, synced: 1 }), false, "partial success is not a reach error");
  assert.equal(showReachError({ ...base, failed: 0 }), false);
});

test("nearMePrompt: asks first, sends to Settings only when iOS will not ask again", () => {
  assert.deepEqual(nearMePrompt("undetermined", true), { action: "ask", label: "Show missions near me" });
  assert.deepEqual(nearMePrompt("denied", true), { action: "ask", label: "Show missions near me" });
  assert.deepEqual(nearMePrompt("denied", false), { action: "settings", label: "Turn on location in Settings" });
  assert.equal(nearMePrompt("granted", true).action, "retry");
  assert.equal(nearMePrompt("checking", true).action, "none");
});
