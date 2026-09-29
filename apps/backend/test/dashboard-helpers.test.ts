// dashboard-helpers.test.ts: unit tests for the Overview chart and table helpers — status
// breakdown, the zero-filled daily series, relative day labels, ordering, and the URL-backed
// workspace filters (parse, serialise, sort).

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  alerts,
  applyReportFilters,
  neighbours,
  byNewest,
  dailyCounts,
  parseReportFilters,
  relativeDay,
  reportsHref,
  sortReports,
  statusBreakdown,
} from "../lib/dashboard.js";
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

test("sortReports: oldest keeps bad dates last; status puts attention first", () => {
  const input = [p("nope"), p("2026-09-20T00:00:00Z", 2), p("2026-09-01T00:00:00Z")];
  assert.deepEqual(sortReports(input, "oldest").map((x) => x.capturedAt), ["2026-09-01T00:00:00Z", "2026-09-20T00:00:00Z", "nope"]);
  // 2026-09-01 with no confirmation is stale ("attention"); the confirmed one ranks last.
  const byStatus = sortReports(input, "status");
  assert.equal(byStatus[0].capturedAt, "2026-09-01T00:00:00Z");
  assert.equal(byStatus[byStatus.length - 1].attestationCount, 2);
});

test("parseReportFilters: keeps valid values, drops unknown status, sort and bad dates", () => {
  const ok = parseReportFilters(new URLSearchParams("status=attention&sort=oldest&from=2026-09-01&q=pump&programme=Health"));
  assert.deepEqual(ok, { status: "attention", sort: "oldest", from: "2026-09-01", to: "", q: "pump", programme: "Health" });
  const bad = parseReportFilters(new URLSearchParams("status=hacked&sort=evil&from=yesterday&to=2026-9-1"));
  assert.deepEqual(bad, { status: "", sort: "newest", from: "", to: "", q: "", programme: "" });
});

test("reportsHref: round-trips through parseReportFilters and omits defaults", () => {
  assert.equal(reportsHref(), "/dashboard/reports");
  assert.equal(reportsHref({ sort: "newest", q: "" }), "/dashboard/reports");
  const href = reportsHref({ status: "ready", programme: "Water and sanitation", sort: "activity" });
  const back = parseReportFilters(new URL(href, "http://x").searchParams);
  assert.equal(back.status, "ready");
  assert.equal(back.programme, "Water and sanitation");
  assert.equal(back.sort, "activity");
});

test("applyReportFilters: status, programme, search, inclusive dates, then sort", () => {
  const list: ProofSummary[] = [
    { proofHash: "a", taskId: "water-pump-repair", geohashRegion: "6gkzw", capturedAt: "2026-09-10T08:00:00Z", attestationCount: 2 },
    { proofHash: "b", taskId: "solar-panel-install", geohashRegion: "d2g6f", capturedAt: "2026-09-12T08:00:00Z", attestationCount: 2 },
    { proofHash: "c", taskId: "latrine-construction", geohashRegion: "6gkzw", capturedAt: "2026-09-14T08:00:00Z", attestationCount: 2 },
    { proofHash: "d", taskId: "water-pump-repair", geohashRegion: "6gkzm", capturedAt: "2026-09-16T08:00:00Z", attestationCount: 1 },
  ];
  assert.deepEqual(applyReportFilters(list, {}).map((p) => p.proofHash), ["d", "c", "b", "a"]);
  assert.deepEqual(applyReportFilters(list, { status: "confirmed", sort: "oldest" }).map((p) => p.proofHash), ["a", "b", "c"]);
  assert.deepEqual(applyReportFilters(list, { programme: "Water and sanitation" }).map((p) => p.proofHash), ["d", "c", "a"]);
  assert.deepEqual(applyReportFilters(list, { q: "6GKZW" }).map((p) => p.proofHash), ["c", "a"]);
  assert.deepEqual(applyReportFilters(list, { q: "pump" }).map((p) => p.proofHash), ["d", "a"]);
  assert.deepEqual(applyReportFilters(list, { from: "2026-09-12", to: "2026-09-14" }).map((p) => p.proofHash), ["c", "b"]);
});

test("neighbours: position and prev/next inside a view; null when not in it", () => {
  const list = [p("2026-09-03T00:00:00Z"), p("2026-09-02T00:00:00Z"), p("2026-09-01T00:00:00Z")];
  const mid = neighbours(list, list[1].proofHash);
  assert.equal(mid?.index, 1);
  assert.equal(mid?.total, 3);
  assert.equal(mid?.prev?.proofHash, list[0].proofHash);
  assert.equal(mid?.next?.proofHash, list[2].proofHash);
  assert.equal(neighbours(list, list[0].proofHash)?.prev, null);
  assert.equal(neighbours(list, list[2].proofHash)?.next, null);
  assert.equal(neighbours(list, "missing"), null);
});

test("alerts: stale-report alert links to the pre-filtered, oldest-first workspace", () => {
  const list = alerts([p("2026-01-01T00:00:00Z")], false);
  assert.equal(list[0]?.link?.href, "/dashboard/reports?status=attention&sort=oldest");
});
