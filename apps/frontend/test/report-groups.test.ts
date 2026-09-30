// report-groups.test.ts: My reports groups per-photo rows into reports (newest first), gives each the
// status of its least-advanced photo, and filters them: "In progress" = ready or waiting,
// "Confirmed" = confirmed, with counts that always add up to All.

import { test } from "node:test";
import assert from "node:assert/strict";
import type { LocalProof } from "../src/queue-row.js";
import { combinedStatus, filterCounts, filterReports, groupReports } from "../src/report-groups.js";

function row(p: Partial<LocalProof>): LocalProof {
  return { id: "r", status: "pending_sync", attestationCount: 0, reportId: "", ...p } as LocalProof;
}

const rows = [
  row({ id: "a1", reportId: "A", status: "pending_sync" }),
  row({ id: "a2", reportId: "A", status: "synced" }),
  row({ id: "b1", reportId: "B", status: "synced", attestationCount: 0 }),
  row({ id: "c1", reportId: "C", status: "attested", attestationCount: 2 }),
  row({ id: "legacy", reportId: "", status: "attested" }),
];

test("rows group into reports in first-seen (newest) order", () => {
  assert.deepEqual(groupReports(rows).map((g) => g.key), ["A", "B", "C", "row:legacy"]);
});

test("a report takes the status of its least-advanced photo", () => {
  const [a, b, c] = groupReports(rows);
  assert.equal(combinedStatus(a!.rows), "ready");
  assert.equal(combinedStatus(b!.rows), "waiting");
  assert.equal(combinedStatus(c!.rows), "confirmed");
});

test("filters split in progress from confirmed, and counts add up", () => {
  const groups = groupReports(rows);
  assert.deepEqual(filterReports(groups, "all").map((g) => g.key), ["A", "B", "C", "row:legacy"]);
  assert.deepEqual(filterReports(groups, "progress").map((g) => g.key), ["A", "B"]);
  assert.deepEqual(filterReports(groups, "confirmed").map((g) => g.key), ["C", "row:legacy"]);
  const n = filterCounts(groups);
  assert.deepEqual(n, { all: 4, progress: 2, confirmed: 2 });
  assert.equal(n.progress + n.confirmed, n.all);
});
