// progress.ts: pure helpers for the completion and contribution screens — community confirmation
// progress for an assignment, resolving the report a screen was opened for, and the four-stage
// timeline with plain descriptions. No react-native import, so node --test covers it.

import type { LocalProof } from "./queue-row";
import type { TaskDef } from "./tasks";

export interface CommunityProgress {
  have: number;
  need: number;
}

/** Confirmations the programme asked for on an assignment; null for self-started reports. */
export function communityProgress(task: TaskDef): CommunityProgress | null {
  return task.confirmations ?? null;
}

/** "1 more report needed" from structured progress. */
export function progressLabelFor(p: CommunityProgress): string {
  const left = Math.max(0, p.need - p.have);
  return `${left} more ${left === 1 ? "report" : "reports"} needed`;
}

/** All rows of the report identified by a reportId, a row id, or one of its proofHashes. */
export function findReport(rows: LocalProof[], id: string): LocalProof[] {
  if (!id) return [];
  const byReport = rows.filter((r) => r.reportId && r.reportId === id);
  if (byReport.length > 0) return byReport;
  const one = rows.find((r) => r.id === id || r.proofHash === id);
  if (!one) return [];
  return one.reportId ? rows.filter((r) => r.reportId === one.reportId) : [one];
}

export interface Stage {
  label: string;
  detail: string;
  done: boolean;
  current: boolean;
}

/** Timeline stages: a stage is done only once every proof in the report reached it. */
export function reportStages(group: LocalProof[]): Stage[] {
  const sent = group.length > 0 && group.every((r) => r.status === "synced" || r.status === "attested");
  const confirmed = group.length > 0 && group.every((r) => r.status === "attested" || r.attestationCount > 0);
  return [
    {
      label: "Saved on this phone",
      detail: "Your report is stored on this phone. It will be sent automatically when you are online.",
      done: true,
      current: false,
    },
    {
      label: "Sent to programme",
      detail: "Your report has been shared with the programme, with the approximate area only.",
      done: sent,
      current: !sent,
    },
    {
      label: "Community reviewed",
      detail: "Other reports from this area are compared to build a clearer picture.",
      done: confirmed,
      current: sent && !confirmed,
    },
    {
      label: "Confirmed",
      detail: "Your report is confirmed and adds to a clearer picture for action.",
      done: confirmed,
      current: false,
    },
  ];
}
