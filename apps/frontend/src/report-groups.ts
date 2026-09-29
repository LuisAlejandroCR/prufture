// report-groups.ts: pure helpers for My reports — group per-photo rows into reports by the local
// reportId, the combined status of a report (its least-advanced photo), and the All / In progress /
// Confirmed filter with counts. No react-native import, so node --test covers it.

import type { LocalProof } from "./queue-row";
import type { FriendlyStatus } from "./theme";

export interface ReportGroup {
  /** reportId when present, otherwise the single row id (pre-hotfix rows). */
  key: string;
  rows: LocalProof[];
}

export type ReportFilter = "all" | "progress" | "confirmed";

/** Group per-photo rows into reports. Rows arrive newest-first and stay that way. */
export function groupReports(rows: LocalProof[]): ReportGroup[] {
  const order: string[] = [];
  const byKey = new Map<string, LocalProof[]>();
  for (const r of rows) {
    const key = r.reportId || `row:${r.id}`;
    const bucket = byKey.get(key);
    if (bucket) bucket.push(r);
    else {
      byKey.set(key, [r]);
      order.push(key);
    }
  }
  return order.map((key) => ({ key, rows: byKey.get(key) as LocalProof[] }));
}

/** Combined status of a report: the least-advanced of its rows. */
export function combinedStatus(rows: LocalProof[]): FriendlyStatus {
  if (rows.some((r) => r.status === "pending_sync")) return "ready";
  if (rows.some((r) => r.status === "synced" && r.attestationCount === 0)) return "waiting";
  return "confirmed";
}

export function filterReports(groups: ReportGroup[], filter: ReportFilter): ReportGroup[] {
  if (filter === "all") return groups;
  return groups.filter((g) => (combinedStatus(g.rows) === "confirmed") === (filter === "confirmed"));
}

export function filterCounts(groups: ReportGroup[]): Record<ReportFilter, number> {
  const confirmed = filterReports(groups, "confirmed").length;
  return { all: groups.length, progress: groups.length - confirmed, confirmed };
}
