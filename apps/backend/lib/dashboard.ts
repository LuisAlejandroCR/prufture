// dashboard.ts: pure aggregation helpers over the coarse proof list for the
// stakeholder dashboard. Input is already region-level (geohash prefix only): these
// helpers never see a full geohash, GPS point, or reporter identity and cannot add
// one. Distinct from lib/api.ts (the fetch layer).

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
    });
  }

  return out;
}
