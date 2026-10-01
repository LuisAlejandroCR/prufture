// dashboard.ts: pure aggregation helpers over the coarse proof list for the stakeholder dashboard.
// Input is region-level only (geohash prefix); these helpers never see a full geohash, GPS point or
// reporter identity and cannot add one.

import type { ProofSummary } from "./api";
import { foldText, placeLabel } from "./places";

/** Friendly review status shown to programme staff. */
export type ReviewStatus = "ready" | "needs-another" | "confirmed" | "attention";

export const REVIEW_LABEL: Record<ReviewStatus, string> = {
  ready: "Ready to review",
  "needs-another": "Needs another report",
  confirmed: "Confirmed",
  attention: "Needs attention",
};

export const REVIEW_CLASS: Record<ReviewStatus, string> = {
  ready: "info",
  "needs-another": "wait",
  confirmed: "ok",
  attention: "attn",
};

/** Task ids picked from the reporter app's catalogue arrive as `item:<id>`; the prefix is not a word. */
function baseTaskId(taskId: string): string {
  return taskId.replace(/^item:/, "");
}

/** Humanized activity label. Falls back to the raw task id for anything unknown. */
export function activityLabel(rawTaskId: string): string {
  const taskId = baseTaskId(rawTaskId);
  const known: Record<string, string> = {
    "solar-panel-install": "Solar panels installed",
    "water-pump-repair": "Hand pump repaired",
    "latrine-construction": "Latrines constructed",
    "teacher-training": "Teacher training delivered",
    "vaccination-drive": "Vaccination drive",
    "nutrition-screening": "Nutrition screening",
    "tree-planting": "Trees planted",
    "child-friendly-space": "Child-friendly space set up",
  };
  if (known[taskId]) return known[taskId];
  return taskId
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Broad programme grouping for the Programme column and page. */
export function programmeName(rawTaskId: string): string {
  const taskId = baseTaskId(rawTaskId);
  if (/(solar|teacher|school|classroom)/.test(taskId)) return "Education";
  if (/(water|pump|latrine|sanitation|toilet|handwash|hygiene)/.test(taskId)) return "Water and sanitation";
  if (/(vaccin|immuni|cold-chain|health|clinic)/.test(taskId)) return "Health";
  if (/(nutri|feeding)/.test(taskId)) return "Nutrition";
  if (/(child-friendly|protection|safe-space)/.test(taskId)) return "Child protection";
  if (/(tree|climate|environment)/.test(taskId)) return "Climate and environment";
  if (/(train)/.test(taskId)) return "Training";
  return "Other";
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const STALE_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * Dashboard status of one report. "Confirmed" is the community rule the public /verify page uses
 * (two pass-carrying reports nearby), decided by the api; it is never inferred from the on-chain
 * count, which is at most 1 per proof. An anchored report that is not yet confirmed needs another
 * community report; one not yet anchored is ready to review, or needs attention once stale.
 */
export function reviewStatus(p: ProofSummary): ReviewStatus {
  if (p.communityConfirmed === true) return "confirmed";
  if (p.attestationCount >= 1) return "needs-another";
  const captured = new Date(p.capturedAt).getTime();
  if (!Number.isNaN(captured) && Date.now() - captured > STALE_MS) return "attention";
  return "ready";
}

export interface Metrics {
  thisWeek: number;
  /** Reports captured in the seven days before this week, for a week-over-week comparison. */
  lastWeek: number;
  readyToReview: number;
  needAnother: number;
  confirmed: number;
  /** Distinct programme groups (programmeName), e.g. Education, Health. */
  programmes: number;
  /** Distinct activity types (taskId) inside those programmes. */
  activities: number;
  areas: number;
}

export function metrics(proofs: ProofSummary[], now: number = Date.now()): Metrics {
  const age = (p: ProofSummary) => {
    const t = new Date(p.capturedAt).getTime();
    return Number.isNaN(t) ? null : now - t;
  };
  return {
    thisWeek: proofs.filter((p) => {
      const a = age(p);
      return a !== null && a <= WEEK_MS;
    }).length,
    lastWeek: proofs.filter((p) => {
      const a = age(p);
      return a !== null && a > WEEK_MS && a <= 2 * WEEK_MS;
    }).length,
    readyToReview: proofs.filter((p) => reviewStatus(p) === "ready").length,
    needAnother: proofs.filter((p) => reviewStatus(p) === "needs-another").length,
    confirmed: proofs.filter((p) => reviewStatus(p) === "confirmed").length,
    programmes: new Set(proofs.map((p) => programmeName(p.taskId))).size,
    activities: new Set(proofs.map((p) => p.taskId)).size,
    areas: new Set(proofs.map((p) => p.geohashRegion).filter(Boolean)).size,
  };
}

/** Plain-language week-over-week line: "4 more than last week", "Same as last week", ... */
export function weekTrend(thisWeek: number, lastWeek: number): { text: string; direction: "up" | "down" | "flat" } {
  const d = thisWeek - lastWeek;
  if (d === 0) return { text: "Same as last week", direction: "flat" };
  if (lastWeek === 0) return { text: `Up from none last week`, direction: "up" };
  return d > 0
    ? { text: `${d} more than last week`, direction: "up" }
    : { text: `${-d} fewer than last week`, direction: "down" };
}

export interface ProgrammeRow {
  taskId: string;
  received: number;
  confirmed: number;
  attention: number;
  areas: number;
  lastActivity: string;
}

export function programmes(proofs: ProofSummary[]): ProgrammeRow[] {
  const byTask = new Map<string, ProofSummary[]>();
  for (const p of proofs) {
    const list = byTask.get(p.taskId) ?? [];
    list.push(p);
    byTask.set(p.taskId, list);
  }
  return [...byTask.entries()]
    .map(([taskId, list]) => ({
      taskId,
      received: list.length,
      confirmed: list.filter((p) => reviewStatus(p) === "confirmed").length,
      attention: list.filter((p) => reviewStatus(p) === "attention").length,
      areas: new Set(list.map((p) => p.geohashRegion).filter(Boolean)).size,
      lastActivity: [...list.map((p) => p.capturedAt)].sort().slice(-1)[0] ?? "",
    }))
    .sort((a, b) => b.received - a.received);
}

export interface ProgrammeGroup {
  name: string;
  received: number;
  confirmed: number;
  attention: number;
  areas: number;
  activities: ProgrammeRow[];
}

/**
 * Activity rows grouped under their programme (programmeName), each group with its own totals.
 * Groups sort by reports received, then name; activities keep programmes()' order.
 */
export function programmeGroups(proofs: ProofSummary[]): ProgrammeGroup[] {
  const groups = new Map<string, ProgrammeGroup>();
  for (const row of programmes(proofs)) {
    const name = programmeName(row.taskId);
    const g = groups.get(name) ?? { name, received: 0, confirmed: 0, attention: 0, areas: 0, activities: [] };
    g.received += row.received;
    g.confirmed += row.confirmed;
    g.attention += row.attention;
    g.activities.push(row);
    groups.set(name, g);
  }
  for (const g of groups.values()) {
    // Areas are counted per group, not summed: one area can host several activities.
    g.areas = new Set(
      proofs.filter((p) => programmeName(p.taskId) === g.name).map((p) => p.geohashRegion).filter(Boolean),
    ).size;
  }
  return [...groups.values()].sort((a, b) => b.received - a.received || a.name.localeCompare(b.name));
}

export interface AreaRow {
  region: string;
  received: number;
  confirmed: number;
  needsAnother: number;
}

export function areas(proofs: ProofSummary[]): AreaRow[] {
  const byRegion = new Map<string, ProofSummary[]>();
  for (const p of proofs) {
    const key = p.geohashRegion || "(none)";
    const list = byRegion.get(key) ?? [];
    list.push(p);
    byRegion.set(key, list);
  }
  return [...byRegion.entries()]
    .map(([region, list]) => ({
      region,
      received: list.length,
      confirmed: list.filter((p) => reviewStatus(p) === "confirmed").length,
      needsAnother: list.filter((p) => reviewStatus(p) === "needs-another").length,
    }))
    .sort((a, b) => b.received - a.received);
}

export interface Alert {
  id: string;
  severity: "high" | "normal";
  what: string;
  why: string;
  action: string;
  when: string;
  /** Where the fix starts: a pre-filtered dashboard view, when one exists. */
  link?: { href: string; label: string };
}

/** "45 reports in 2 areas need a second community report": counts reports, never activities. */
export function needsSecondText(list: ProofSummary[]): string {
  const n = list.length;
  const k = new Set(list.map((p) => p.geohashRegion).filter(Boolean)).size;
  const where = k > 1 ? ` in ${k} areas` : "";
  return `${n} report${n === 1 ? "" : "s"}${where} need${n === 1 ? "s" : ""} a second community report`;
}

export function alerts(proofs: ProofSummary[], apiDegraded: boolean): Alert[] {
  const out: Alert[] = [];

  if (apiDegraded) {
    out.push({
      id: "api-degraded",
      severity: "high",
      what: "The report index is unreachable",
      why: "New reports cannot be listed or reviewed while the service is down.",
      action: "Check the API service health and restart it if needed.",
      when: "now",
    });
  }

  const stale = proofs.filter((p) => reviewStatus(p) === "attention");
  if (stale.length > 0) {
    out.push({
      id: "stale-reports",
      severity: "normal",
      what: `${stale.length} report${stale.length === 1 ? "" : "s"} waiting more than 3 days`,
      why: "Reports left unreviewed slow down programme confirmation.",
      action: "Open Reports, filter by Needs attention, and review the oldest first.",
      when: "today",
      link: { href: reportsHref({ status: "attention", sort: "oldest" }), label: "Review stale reports" },
    });
  }

  const needsAnother = proofs.filter((p) => reviewStatus(p) === "needs-another");
  if (needsAnother.length > 0) {
    out.push({
      id: "needs-second",
      severity: "normal",
      what: needsSecondText(needsAnother),
      why: "Each of these has one community report; a second report of the same activity confirms it.",
      action: "Ask a second community member in the area to report the same activity.",
      when: "this week",
      link: { href: "/dashboard/communities", label: "See areas needing a report" },
    });
  }

  return out;
}

import { decodeGeohashBounds, type GeohashBounds } from "./geohash";

/** One coarse geohash cell on the coverage map: aggregate counts only, no precise point. */
export interface CoverageCell {
  region: string;
  lat: number;
  lng: number;
  bounds: GeohashBounds;
  count: number;
  confirmed: number;
}

/**
 * Group the coarse proof list by `geohashRegion` (5-char cell), decode each cell to its
 * box, and count reports and confirmed reports per cell. Cells whose region is empty or
 * fails to decode are dropped. Sorted by report count descending.
 */
export function coverage(proofs: ProofSummary[]): CoverageCell[] {
  const byRegion = new Map<string, ProofSummary[]>();
  for (const p of proofs) {
    const region = p.geohashRegion || "";
    if (!region) continue;
    const list = byRegion.get(region) ?? [];
    list.push(p);
    byRegion.set(region, list);
  }

  const cells: CoverageCell[] = [];
  for (const [region, list] of byRegion) {
    const bounds = decodeGeohashBounds(region);
    if (!bounds) continue;
    cells.push({
      region,
      lat: (bounds.minLat + bounds.maxLat) / 2,
      lng: (bounds.minLng + bounds.maxLng) / 2,
      bounds,
      count: list.length,
      confirmed: list.filter((p) => reviewStatus(p) === "confirmed").length,
    });
  }
  return cells.sort((a, b) => b.count - a.count);
}

/** Smallest and largest on-screen radius (px) of a zone's click target on the coverage map. */
export const ZONE_MARKER_MIN_PX = 9;
export const ZONE_MARKER_MAX_PX = 18;

/**
 * Pixel radius of the round marker drawn at a zone's centre. A 2.4 km zone is a sub-pixel speck
 * at country or world zoom, so the shaded square alone cannot be seen or clicked; the marker keeps
 * a finger-sized target at every zoom and grows with the zone's share of reports.
 */
export function zoneMarkerRadius(count: number, maxCount: number): number {
  if (!(maxCount > 0) || !(count > 0)) return ZONE_MARKER_MIN_PX;
  const share = Math.min(1, count / maxCount);
  return Math.round(ZONE_MARKER_MIN_PX + (ZONE_MARKER_MAX_PX - ZONE_MARKER_MIN_PX) * Math.sqrt(share));
}

export const REVIEW_ORDER: ReviewStatus[] = ["confirmed", "needs-another", "ready", "attention"];

/** Count of reports in each review status, in the fixed REVIEW_ORDER. */
export function statusBreakdown(proofs: ProofSummary[]): { status: ReviewStatus; count: number }[] {
  const counts = new Map<ReviewStatus, number>(REVIEW_ORDER.map((s) => [s, 0]));
  for (const p of proofs) {
    const s = reviewStatus(p);
    counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  return REVIEW_ORDER.map((status) => ({ status, count: counts.get(status) ?? 0 }));
}

/**
 * Reports per UTC day for the last `days` days, oldest first, ending today. Days with no
 * reports are present with a zero count so the chart has no gaps.
 */
export function dailyCounts(
  proofs: ProofSummary[],
  days = 14,
  now: number = Date.now(),
): { day: string; count: number }[] {
  const today = new Date(now);
  today.setUTCHours(0, 0, 0, 0);
  const out: { day: string; count: number }[] = [];
  const index = new Map<string, number>();
  for (let i = days - 1; i >= 0; i--) {
    const key = new Date(today.getTime() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    index.set(key, out.length);
    out.push({ day: key, count: 0 });
  }
  for (const p of proofs) {
    const t = new Date(p.capturedAt);
    if (Number.isNaN(t.getTime())) continue;
    const i = index.get(t.toISOString().slice(0, 10));
    const bucket = i === undefined ? undefined : out[i];
    if (bucket) bucket.count += 1;
  }
  return out;
}

/** "Today", "Yesterday", "3 days ago", or the ISO date past two weeks. Empty for a bad date. */
export function relativeDay(iso: string, now: number = Date.now()): string {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "";
  const startOf = (ms: number) => {
    const d = new Date(ms);
    d.setUTCHours(0, 0, 0, 0);
    return d.getTime();
  };
  const diff = Math.round((startOf(now) - startOf(t.getTime())) / (24 * 60 * 60 * 1000));
  if (diff <= 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff < 14) return `${diff} days ago`;
  return t.toISOString().slice(0, 10);
}

function capturedMs(p: ProofSummary): number | null {
  const t = new Date(p.capturedAt).getTime();
  return Number.isNaN(t) ? null : t;
}

/** Compare by capture time in the given direction; unparseable dates always sink to the end. */
function byCaptured(dir: 1 | -1) {
  return (a: ProofSummary, b: ProofSummary) => {
    const ta = capturedMs(a);
    const tb = capturedMs(b);
    if (ta === null) return tb === null ? 0 : 1;
    if (tb === null) return -1;
    return dir * (ta - tb);
  };
}

/** Newest first by capture time; unparseable dates sink to the end. */
export function byNewest(proofs: ProofSummary[]): ProofSummary[] {
  return [...proofs].sort(byCaptured(-1));
}

/** Sort orders the report workspace supports; "newest" is the default and never written to the URL. */
export type ReportSort = "newest" | "oldest" | "activity" | "status";
export const REPORT_SORTS: ReportSort[] = ["newest", "oldest", "activity", "status"];

export interface ReportFilters {
  status?: ReviewStatus | "";
  programme?: string;
  /** Exact coarse region (geohash cell, at most 5 chars). */
  area?: string;
  q?: string;
  from?: string;
  to?: string;
  sort?: ReportSort;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** A coarse geohash cell: 1-5 base-32 chars. Anything longer is never accepted from a URL. */
const AREA_RE = /^[0-9b-hjkmnp-z]{1,5}$/;

/**
 * Parse workspace filters from URL search params, dropping anything unknown or malformed so a
 * hand-edited link can never put the table in an impossible state.
 */
export function parseReportFilters(params: { get(name: string): string | null }): Required<ReportFilters> {
  const status = params.get("status") ?? "";
  const sort = params.get("sort") ?? "";
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  return {
    status: (REVIEW_ORDER as string[]).includes(status) ? (status as ReviewStatus) : "",
    programme: (params.get("programme") ?? "").slice(0, 80),
    area: AREA_RE.test(params.get("area") ?? "") ? (params.get("area") as string) : "",
    q: (params.get("q") ?? "").slice(0, 80),
    from: DATE_RE.test(from) ? from : "",
    to: DATE_RE.test(to) ? to : "",
    sort: (REPORT_SORTS as string[]).includes(sort) ? (sort as ReportSort) : "newest",
  };
}

/** Query string for a filtered workspace view; empty values and the default sort are omitted. */
export function reportsQuery(f: ReportFilters): string {
  const qs = new URLSearchParams();
  if (f.status) qs.set("status", f.status);
  if (f.programme) qs.set("programme", f.programme);
  if (f.area) qs.set("area", f.area);
  if (f.q) qs.set("q", f.q);
  if (f.from) qs.set("from", f.from);
  if (f.to) qs.set("to", f.to);
  if (f.sort && f.sort !== "newest") qs.set("sort", f.sort);
  const out = qs.toString();
  return out ? `?${out}` : "";
}

export function reportsHref(f: ReportFilters = {}): string {
  return `/dashboard/reports${reportsQuery(f)}`;
}

function utcDay(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

/**
 * Apply workspace filters (status, programme, exact area, text search over activity / task / region / place, and an
 * inclusive UTC date range) and then the chosen sort. The single source of truth for "which
 * reports are in this view", shared by the table, the CSV of the view and report prev/next.
 */
export function applyReportFilters(proofs: ProofSummary[], f: ReportFilters): ProofSummary[] {
  const q = foldText(f.q ?? "");
  const filtered = proofs.filter((p) => {
    if (f.programme && programmeName(p.taskId) !== f.programme) return false;
    if (f.area && p.geohashRegion !== f.area) return false;
    if (f.status && reviewStatus(p) !== f.status) return false;
    const d = utcDay(p.capturedAt);
    if (f.from && d < f.from) return false;
    if (f.to && d > f.to) return false;
    if (q && !foldText(`${activityLabel(p.taskId)} ${p.taskId} ${p.geohashRegion} ${placeLabel(p.geohashRegion)}`).includes(q)) {
      return false;
    }
    return true;
  });
  return sortReports(filtered, f.sort ?? "newest");
}

/** Position of one report inside a filtered view, with its neighbours for prev/next links. */
export function neighbours(
  list: ProofSummary[],
  proofHash: string,
): { index: number; total: number; prev: ProofSummary | null; next: ProofSummary | null } | null {
  const index = list.findIndex((p) => p.proofHash === proofHash);
  if (index < 0) return null;
  return {
    index,
    total: list.length,
    prev: index > 0 ? list[index - 1] ?? null : null,
    next: index < list.length - 1 ? list[index + 1] ?? null : null,
  };
}

const STATUS_RANK: Record<ReviewStatus, number> = { attention: 0, ready: 1, "needs-another": 2, confirmed: 3 };

/** Order a (filtered) report list by the chosen sort; always returns a new array. */
export function sortReports(proofs: ProofSummary[], sort: ReportSort): ProofSummary[] {
  if (sort === "oldest") return [...proofs].sort(byCaptured(1));
  const newest = byNewest(proofs);
  if (sort === "activity") {
    return newest.sort((a, b) => activityLabel(a.taskId).localeCompare(activityLabel(b.taskId)));
  }
  // "status" puts what needs a human first: attention, ready, needs-another, confirmed.
  if (sort === "status") return newest.sort((a, b) => STATUS_RANK[reviewStatus(a)] - STATUS_RANK[reviewStatus(b)]);
  return newest;
}
