// progress.test.ts: completion and contribution helpers — community confirmation progress comes from
// structured assignment data (never a hand-written label), the saved screen can find a report by its
// first proofHash, and the four-stage timeline marks a stage done only when every photo reached it.

import { test } from "node:test";
import assert from "node:assert/strict";
import type { LocalProof } from "../src/queue-row.js";
import { communityProgress, findReport, reportStages } from "../src/progress.js";
import { getTask, itemTaskId, listTasks } from "../src/tasks.js";

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

test("community progress is structured, and the label is derived from it", () => {
  const pump = getTask("water-pump-repair");
  assert.deepEqual(communityProgress(pump), { have: 2, need: 3 });
  assert.equal(pump.progressLabel, "1 more report needed");
  assert.equal(getTask("solar-panel-install").progressLabel, "2 more reports needed");
  for (const t of listTasks()) {
    const p = communityProgress(t);
    if (!p) assert.equal(t.progressLabel, undefined);
    else assert.ok(p.have < p.need && p.need > 0, `${t.id} progress out of range`);
  }
});

test("self-started reports have no community progress to show", () => {
  assert.equal(communityProgress(getTask(itemTaskId("water-point"))), null);
});

test("findReport resolves a reportId, a row id or a proofHash to the whole report", () => {
  const rows = [
    row({ id: "a1", proofHash: "ha1", reportId: "A" }),
    row({ id: "a2", proofHash: "ha2", reportId: "A" }),
    row({ id: "b1", proofHash: "hb1", reportId: "" }),
  ];
  assert.equal(findReport(rows, "A").length, 2);
  assert.equal(findReport(rows, "a2").length, 2);
  assert.equal(findReport(rows, "ha1").length, 2);
  assert.deepEqual(findReport(rows, "hb1").map((r) => r.id), ["b1"]);
  assert.deepEqual(findReport(rows, "nope"), []);
  assert.deepEqual(findReport(rows, ""), []);
});

test("stages: saved, sent, reviewed, confirmed, each with a plain description", () => {
  const pending = reportStages([row({ status: "pending_sync" })]);
  assert.deepEqual(pending.map((s) => s.label), ["Saved on this phone", "Sent to programme", "Community reviewed", "Confirmed"]);
  assert.deepEqual(pending.map((s) => s.done), [true, false, false, false]);
  assert.ok(pending.every((s) => s.detail.length > 0));

  const mixed = reportStages([row({ status: "synced" }), row({ status: "pending_sync" })]);
  assert.equal(mixed[1]!.done, false, "sent only when every photo is sent");

  const waiting = reportStages([row({ status: "synced" })]);
  assert.deepEqual(waiting.map((s) => s.done), [true, true, false, false]);
  assert.equal(waiting[2]!.current, true);

  const confirmed = reportStages([row({ status: "attested" }), row({ status: "synced", attestationCount: 1 })]);
  assert.deepEqual(confirmed.map((s) => s.done), [true, true, true, true]);
});
