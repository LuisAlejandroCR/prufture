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

test("stages without community confirmations: saved, sent, recorded publicly", () => {
  const pending = reportStages([row({ status: "pending_sync" })], null);
  assert.deepEqual(pending.map((s) => s.label), ["Saved on this phone", "Sent to programme", "Recorded publicly"]);
  assert.deepEqual(pending.map((s) => s.short), ["Saved", "Sent", "Recorded"]);
  assert.deepEqual(pending.map((s) => s.done), [true, false, false]);
  assert.ok(pending.every((s) => s.detail.length > 0));

  const mixed = reportStages([row({ status: "synced" }), row({ status: "pending_sync" })], null);
  assert.equal(mixed[1]!.done, false, "sent only when every photo is sent");

  const waiting = reportStages([row({ status: "synced" })], null);
  assert.deepEqual(waiting.map((s) => s.done), [true, true, false]);
  assert.equal(waiting[2]!.current, true);

  const recorded = reportStages([row({ status: "attested" }), row({ status: "synced", attestationCount: 1 })], null);
  assert.deepEqual(recorded.map((s) => s.done), [true, true, true]);
});

test("regression: a public record alone is never 'confirmed by the community'", () => {
  // The old timeline ticked "Confirmed" on the on-chain record while the card read 0 of 3.
  const attested = [row({ status: "attested", attestationCount: 1 })];
  const none = reportStages(attested, { have: 0, need: 3 });
  assert.deepEqual(none.map((s) => s.label), [
    "Saved on this phone",
    "Sent to programme",
    "Recorded publicly",
    "Confirmed by the community",
  ]);
  assert.deepEqual(none.map((s) => s.done), [true, true, true, false]);
  assert.equal(none[3]!.current, true);
  assert.match(none[3]!.detail, /0 of 3 nearby reports/);

  const unknown = reportStages(attested, { have: null, need: 3 });
  assert.equal(unknown[3]!.done, false);
  assert.match(unknown[3]!.detail, /online/);

  const full = reportStages(attested, { have: 3, need: 3 });
  assert.equal(full[3]!.done, true);
});
