// dashboard-helpers.test.ts: unit tests for the Overview chart and table helpers — status
// breakdown, the zero-filled daily series, relative day labels, ordering, and the URL-backed
// workspace filters (parse, serialise, sort).

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  alerts,
  applyReportFilters,
  metrics,
  neighbours,
  programmeGroups,
  weekTrend,
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
  assert.deepEqual(ok, { status: "attention", sort: "oldest", from: "2026-09-01", to: "", q: "pump", programme: "Health", area: "" });
  const bad = parseReportFilters(new URLSearchParams("status=hacked&sort=evil&from=yesterday&to=2026-9-1"));
  assert.deepEqual(bad, { status: "", sort: "newest", from: "", to: "", q: "", programme: "", area: "" });
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

test("metrics: this week vs the seven days before, bad dates in neither", () => {
  const m = metrics(
    [p("2026-09-28T12:00:00Z"), p("2026-09-25T12:00:00Z"), p("2026-09-20T12:00:00Z"), p("2026-09-01T12:00:00Z"), p("nope")],
    NOW,
  );
  assert.equal(m.thisWeek, 2);
  assert.equal(m.lastWeek, 1);
});

test("metrics: programmes counts programme groups, activities counts task types", () => {
  const mk = (taskId: string, region: string): ProofSummary => ({ ...p("2026-09-28T12:00:00Z"), proofHash: taskId + region, taskId, geohashRegion: region });
  const m = metrics([mk("water-pump-repair", "aaaaa"), mk("latrine-construction", "aaaaa"), mk("vaccination-drive", "bbbbb")], NOW);
  assert.equal(m.programmes, 2); // Water and sanitation, Health
  assert.equal(m.activities, 3);
  assert.equal(m.areas, 2);
});

test("programmeGroups: activities nested under their programme with group totals", () => {
  const mk = (taskId: string, region: string, count = 0): ProofSummary => ({
    ...p("2026-09-28T12:00:00Z", count),
    proofHash: `${taskId}-${region}-${count}`,
    taskId,
    geohashRegion: region,
  });
  const groups = programmeGroups([
    mk("water-pump-repair", "aaaaa", 2),
    mk("water-pump-repair", "bbbbb"),
    mk("latrine-construction", "aaaaa", 2),
    mk("vaccination-drive", "ccccc"),
  ]);
  assert.deepEqual(groups.map((g) => g.name), ["Water and sanitation", "Health"]);
  const water = groups[0];
  assert.equal(water.received, 3);
  assert.equal(water.confirmed, 2);
  assert.equal(water.areas, 2); // aaaaa counted once across both activities
  assert.deepEqual(water.activities.map((a) => a.taskId), ["water-pump-repair", "latrine-construction"]);
});

test("weekTrend: plain words for more, fewer, same and up-from-none", () => {
  assert.deepEqual(weekTrend(9, 5), { text: "4 more than last week", direction: "up" });
  assert.deepEqual(weekTrend(2, 5), { text: "3 fewer than last week", direction: "down" });
  assert.deepEqual(weekTrend(3, 3), { text: "Same as last week", direction: "flat" });
  assert.equal(weekTrend(4, 0).text, "Up from none last week");
});

test("alerts: stale-report alert links to the pre-filtered, oldest-first workspace", () => {
  const list = alerts([p("2026-01-01T00:00:00Z")], false);
  assert.equal(list[0]?.link?.href, "/dashboard/reports?status=attention&sort=oldest");
});

test("area filter: exact cell match, validated from the URL, round-trips", () => {
  const mk = (proofHash: string, geohashRegion: string): ProofSummary => ({
    proofHash,
    taskId: "water-pump-repair",
    geohashRegion,
    capturedAt: "2026-09-28T10:00:00Z",
    attestationCount: 0,
  });
  const list = [mk("a", "d2g62"), mk("b", "d2g6"), mk("c", "u6sce")];
  // Exact match: d2g6 must not pull in d2g62, which a text search would.
  assert.deepEqual(applyReportFilters(list, { area: "d2g6" }).map((p) => p.proofHash), ["b"]);
  assert.deepEqual(applyReportFilters(list, { area: "d2g62" }).map((p) => p.proofHash), ["a"]);
  assert.equal(parseReportFilters(new URLSearchParams("area=d2g62")).area, "d2g62");
  // Too long (a finer cell), invalid base-32 letters and markup are dropped.
  for (const bad of ["d2g62x", "d2ga!", "<b>", "aiilo"]) {
    assert.equal(parseReportFilters(new URLSearchParams(`area=${encodeURIComponent(bad)}`)).area, "", bad);
  }
  const href = reportsHref({ area: "d2g62", status: "needs-another" });
  assert.equal(href, "/dashboard/reports?status=needs-another&area=d2g62");
  assert.equal(parseReportFilters(new URL(href, "http://x").searchParams).area, "d2g62");
});
