// coordinator-summary.ts: the coordinator screen's at-a-glance summary and the "Email summary" draft.
// Pure (no react-native import). The email holds only counts, activity names and the dashboard link,
// where the full list and the CSV export live; never a report hash, an area or a reviewer note.

import { reviewCounts, type CoordinatorReport, type ReviewStatus } from "./coordinator-api";
import { getTask } from "./tasks";

export interface CoordinatorSummary {
  total: number;
  counts: Record<ReviewStatus, number>;
  /** Up to three activities with the most reports, most first. */
  topActivities: { title: string; count: number }[];
  /** ISO time of the most recent report, or null with no reports. */
  latestAt: string | null;
}

export function coordinatorSummary(rows: CoordinatorReport[]): CoordinatorSummary {
  const byTask = new Map<string, number>();
  for (const r of rows) byTask.set(r.taskId, (byTask.get(r.taskId) ?? 0) + 1);
  const topActivities = [...byTask.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([taskId, count]) => ({ title: getTask(taskId).title, count }));
  const latestAt = rows.reduce<string | null>((max, r) => (max === null || r.capturedAt > max ? r.capturedAt : max), null);
  return { total: rows.length, counts: reviewCounts(rows), topActivities, latestAt };
}

export function summaryEmail(s: CoordinatorSummary, dashboardUrl: string): { subject: string; body: string } {
  const lines = [
    `${s.total} ${s.total === 1 ? "report" : "reports"}: ${s.counts.pending} to review, ${s.counts.accepted} accepted, ${s.counts.rejected} rejected.`,
  ];
  if (s.topActivities.length > 0) {
    lines.push("", "Most reported activities:", ...s.topActivities.map((a) => `- ${a.title}: ${a.count}`));
  }
  if (s.latestAt) lines.push("", `Latest report: ${s.latestAt.slice(0, 10)}`);
  lines.push("", `Full list and CSV export: ${dashboardUrl}`);
  return { subject: `Prufture reports summary: ${s.counts.pending} to review`, body: lines.join("\n") };
}

/** A mailto: link with no recipient, so the coordinator chooses who gets it in their own mail app. */
export function summaryMailto(mail: { subject: string; body: string }): string {
  return `mailto:?subject=${encodeURIComponent(mail.subject)}&body=${encodeURIComponent(mail.body)}`;
}
