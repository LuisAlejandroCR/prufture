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

/**
 * "Could not reach the server" is shown only when the phone is online, reports are still waiting,
 * and the last sync pass failed for all of them. Offline is the Offline pill's job; once nothing is
 * waiting there is nothing to warn about, so a stale notice can never outlive a successful sync.
 */
export function showReachError(s: { online: boolean; pending: number; synced: number; failed: number }): boolean {
  return s.online && s.pending > 0 && s.failed > 0 && s.synced === 0;
}

/** Where the reporter's approximate area stands on Home. */
export type AreaStatus = "checking" | "undetermined" | "denied" | "granted";

export interface NearMePrompt {
  action: "ask" | "settings" | "retry" | "none";
  label: string;
}

/**
 * What the "missions near you" card offers when the area is unknown. The map only opens once the
 * area is known: centred on another continent's mission it only confuses (speedrun on 2026-09-29).
 */
export function nearMePrompt(status: AreaStatus, canAskAgain: boolean): NearMePrompt {
  if (status === "checking") return { action: "none", label: "Finding your area…" };
  if (status === "granted") return { action: "retry", label: "Try again" };
  if (status === "denied" && !canAskAgain) return { action: "settings", label: "Turn on location in Settings" };
  return { action: "ask", label: "Show missions near me" };
}
