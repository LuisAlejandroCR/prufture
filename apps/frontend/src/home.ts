// home.ts: pure helpers for the Missions home — greeting, the confirmed-report count shown in the
// contribution strip, and the text of each mission row. No react-native import, so node --test
// covers it; the screen passes in the hour, the queue rows and the distance label.

import type { LocalProof } from "./queue-row";
import type { TaskDef } from "./tasks";

export function greeting(hour: number): string {
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 18) return "Good afternoon";
  return "Good evening";
}

/**
 * Reports (not photos) that are confirmed: every row of the report is attested or has at least
 * one community confirmation. Rows without a reportId are one report each.
 */
export function confirmedReportCount(rows: LocalProof[]): number {
  const byReport = new Map<string, LocalProof[]>();
  for (const r of rows) {
    const key = r.reportId || `row:${r.id}`;
    byReport.set(key, [...(byReport.get(key) ?? []), r]);
  }
  let n = 0;
  for (const group of byReport.values()) {
    if (group.every((r) => r.status === "attested" || r.attestationCount > 0)) n += 1;
  }
  return n;
}

/** One-line question under a mission title, e.g. "Is water coming out of the pump?". */
export function missionQuestion(task: TaskDef): string {
  return task.questions[0]?.text ?? task.purpose;
}

/** Location line of a mission row: "Nearby area", or the area name with a rounded distance. */
export function missionPlace(task: TaskDef, distance: string | null): string {
  if (distance === "Nearby") return "Nearby area";
  return distance ? `${task.area} · ${distance}` : task.area;
}
