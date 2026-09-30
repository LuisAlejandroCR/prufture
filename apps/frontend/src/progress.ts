// progress.ts: pure helpers for the completion and contribution screens — community confirmation
// progress for an assignment, resolving the report a screen was opened for, and the report timeline
// (saved, sent, recorded publicly, plus confirmed by the community for assignments that ask for it)
// with plain descriptions. No react-native import, so node --test covers it.

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
  /** One word for the compact stepper. */
  short: string;
  detail: string;
  done: boolean;
  current: boolean;
}

/**
 * Timeline stages: a stage is done only once every proof in the report reached it. "Recorded publicly"
 * is the on-chain record. An assignment that asks for community confirmations gets a last stage, done
 * only when that count is met (`have` null = not checked yet). The public record alone never
 * counts as a community confirmation.
 */
export function reportStages(
  group: LocalProof[],
  community: { have: number | null; need: number } | null,
): Stage[] {
  const sent = group.length > 0 && group.every((r) => r.status === "synced" || r.status === "attested");
  const recorded = group.length > 0 && group.every((r) => r.status === "attested" || r.attestationCount > 0);
  const stages: Omit<Stage, "current">[] = [
    {
      label: "Saved on this phone",
      short: "Saved",
      detail: "Your report is stored on this phone. It will be sent automatically when you are online.",
      done: true,
    },
    {
      label: "Sent to programme",
      short: "Sent",
      detail: "Your report has been shared with the programme, with the approximate area only.",
      done: sent,
    },
    {
      label: "Recorded publicly",
      short: "Recorded",
      detail: "A tamper-proof record now exists. Anyone can check it on the public page.",
      done: recorded,
    },
  ];
  if (community) {
    stages.push({
      label: "Confirmed by the community",
      short: "Confirmed",
      detail:
        community.have === null
          ? "Nearby reports are counted once the phone is online."
          : `${community.have} of ${community.need} nearby reports so far.`,
      done: community.have !== null && community.have >= community.need,
    });
  }
  const firstOpen = stages.findIndex((s) => !s.done);
  return stages.map((s, i) => ({ ...s, current: i === firstOpen }));
}
