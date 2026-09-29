// dashboard.ts: pure aggregation helpers over the coarse proof list for the stakeholder dashboard.
// Input is region-level only (geohash prefix); these helpers never see a full geohash, GPS point or
// reporter identity and cannot add one.

import type { ProofSummary } from "./api";

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

/** Humanized activity label. Falls back to the raw task id for anything unknown. */
export function activityLabel(taskId: string): string {
  const known: Record<string, string> = {
    "solar-panel-install": "Solar panels installed",
    "water-pump-repair": "Hand pump repaired",
    "latrine-construction": "Latrines constructed",
    "teacher-training": "Teacher training delivered",
    "vaccination-drive": "Vaccination drive",
    "nutrition-screening": "Nutrition screening",
  };
  if (known[taskId]) return known[taskId];
  return taskId
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Broad programme grouping for the Programme column and page. */
export function programmeName(taskId: string): string {
  if (/(solar|teacher|school|classroom)/.test(taskId)) return "Education";
  if (/(water|pump|latrine|sanitation|toilet)/.test(taskId)) return "Water and sanitation";
  if (/(vaccin|health|clinic)/.test(taskId)) return "Health";
  if (/(nutri|feeding)/.test(taskId)) return "Nutrition";
  if (/(train)/.test(taskId)) return "Training";
  return "Other";
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const STALE_MS = 3 * 24 * 60 * 60 * 1000;

export function reviewStatus(p: ProofSummary): ReviewStatus {
  if (p.attestationCount >= 2) return "confirmed";
  if (p.attestationCount === 1) return "needs-another";
  const captured = new Date(p.capturedAt).getTime();
  if (!Number.isNaN(captured) && Date.now() - captured > STALE_MS) return "attention";
  return "ready";
}

export interface Metrics {
  thisWeek: number;
  readyToReview: number;
  needAnother: number;
  confirmed: number;
  programmes: number;
  areas: number;
}

export function metrics(proofs: ProofSummary[]): Metrics {
  const now = Date.now();
  return {
    thisWeek: proofs.filter((p) => {
      const t = new Date(p.capturedAt).getTime();
      return !Number.isNaN(t) && now - t <= WEEK_MS;
    }).length,
    readyToReview: proofs.filter((p) => reviewStatus(p) === "ready").length,
    needAnother: proofs.filter((p) => reviewStatus(p) === "needs-another").length,
    confirmed: proofs.filter((p) => reviewStatus(p) === "confirmed").length,
    programmes: new Set(proofs.map((p) => p.taskId)).size,
    areas: new Set(proofs.map((p) => p.geohashRegion).filter(Boolean)).size,
  };
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
      what: `${needsAnother.length} activit${needsAnother.length === 1 ? "y" : "ies"} need a second community report`,
      why: "One report is in but a second is needed to mark the activity confirmed.",
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
  q?: string;
  from?: string;
  to?: string;
  sort?: ReportSort;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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
