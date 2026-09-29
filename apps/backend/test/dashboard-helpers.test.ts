// dashboard-helpers.test.ts: unit tests for the Overview chart and table helpers — status
// breakdown, the zero-filled daily series, relative day labels and newest-first ordering.

import { test } from "node:test";
import assert from "node:assert/strict";
import { byNewest, dailyCounts, relativeDay, statusBreakdown } from "../lib/dashboard.js";
import type { ProofSummary } from "../lib/api.js";

const NOW = Date.parse("2026-09-29T12:00:00Z");
const p = (capturedAt: string, attestationCount = 0): ProofSummary => ({
  proofHash: capturedAt + attestationCount,
  taskId: "water-pump-repair",
  geohashRegion: "6gkzw",
  capturedAt,
  attestationCount,
});

test("statusBreakdown: fixed order, every status present, counts sum to the input", () => {
  const rows = statusBreakdown([p(new Date().toISOString(), 2), p(new Date().toISOString(), 1), p(new Date().toISOString(), 2)]);
  assert.deepEqual(rows.map((r) => r.status), ["confirmed", "needs-another", "ready", "attention"]);
  assert.equal(rows.find((r) => r.status === "confirmed")?.count, 2);
  assert.equal(rows.reduce((n, r) => n + r.count, 0), 3);
});

test("dailyCounts: zero-filled, oldest first, ends today, ignores out-of-range and bad dates", () => {
  const series = dailyCounts(
    [p("2026-09-29T01:00:00Z"), p("2026-09-29T09:00:00Z"), p("2026-09-27T10:00:00Z"), p("2026-08-01T00:00:00Z"), p("nope")],
    7,
    NOW,
  );
  assert.equal(series.length, 7);
  assert.equal(series[0].day, "2026-09-23");
  assert.equal(series[6].day, "2026-09-29");
  assert.equal(series[6].count, 2);
  assert.equal(series[4].count, 1);
  assert.equal(series.reduce((n, d) => n + d.count, 0), 3);
});

test("relativeDay: today, yesterday, n days ago, then the date", () => {
  assert.equal(relativeDay("2026-09-29T00:30:00Z", NOW), "Today");
  assert.equal(relativeDay("2026-09-28T23:00:00Z", NOW), "Yesterday");
  assert.equal(relativeDay("2026-09-24T10:00:00Z", NOW), "5 days ago");
  assert.equal(relativeDay("2026-08-01T10:00:00Z", NOW), "2026-08-01");
  assert.equal(relativeDay("nope", NOW), "");
});

test("byNewest: newest first, bad dates last, input untouched", () => {
  const input = [p("nope"), p("2026-09-01T00:00:00Z"), p("2026-09-20T00:00:00Z")];
  assert.deepEqual(byNewest(input).map((x) => x.capturedAt), ["2026-09-20T00:00:00Z", "2026-09-01T00:00:00Z", "nope"]);
  assert.equal(input[0].capturedAt, "nope");
});
