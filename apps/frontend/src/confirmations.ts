// confirmations.ts: live community confirmations for a programme assignment. Decides which independent
// reports (from the api's GET /proof/:hash/confirmations) count: near the assignment's cell, carrying a
// verified programme pass (one per member per task and epoch, so two passes are two members) and, for a
// high-assurance task, also participant-confirmed per src/assurance.ts. Pure and injectable, no react-native.

import { assuranceFromProof, countsAsParticipantConfirmed } from "./assurance";
import { cellDistanceKm, type TaskDef } from "./tasks";

/** One independent field report for the same task, as the api returns it. */
export interface ConfirmationReport {
  own: boolean;
  geohashRegion: string;
  verifiedPerson: boolean | null;
  verifiedPersonDegraded: boolean | null;
  /** Verified programme pass. Missing from an older api reads as false, so it never counts. */
  membershipVerified: boolean;
  /**
   * Round (personhood epoch) of that pass. A new round lets a member prove once more per task, so
   * passes of different rounds may be one person and never add up. Missing reads as round 0.
   */
  round?: number;
}

const roundOf = (r: ConfirmationReport) => r.round ?? 0;

/** A report counts only from within this distance of the assignment cell (same as "Nearby"). */
export const NEARBY_KM = 5;

export interface LiveConfirmations {
  /** Reports that count, including the reporter's own when it qualifies. */
  have: number;
  need: number;
  /** Nearby reports left out because the task needs participant-confirmed reports. */
  notConfirmed: number;
  /** Whether the reporter's own report is one of the `have`. */
  ownCounts: boolean;
  highAssurance: boolean;
}

/** True when the report was made near the assignment. An unreadable region never counts. */
export function isNearAssignment(task: TaskDef, region: string): boolean {
  if (!task.cell || !region) return false;
  try {
    return cellDistanceKm(task.cell, region) < NEARBY_KM;
  } catch {
    return false; // not a geohash
  }
}

/** Whether one report counts as a community confirmation for this task. */
export function countsAsConfirmation(task: TaskDef, r: ConfirmationReport, identityStepEnabled: boolean): boolean {
  if (!isNearAssignment(task, r.geohashRegion)) return false;
  if (!r.membershipVerified) return false;
  if (!task.highAssurance) return true;
  return countsAsParticipantConfirmed(assuranceFromProof(r, identityStepEnabled));
}

/** Live progress for an assignment; null for a self-started report or one with no target. */
export function liveConfirmations(
  task: TaskDef,
  reports: ConfirmationReport[],
  identityStepEnabled: boolean,
): LiveConfirmations | null {
  if (task.selfStarted || !task.confirmations) return null;
  let notConfirmed = 0;
  const counting: ConfirmationReport[] = [];
  for (const r of reports) {
    if (countsAsConfirmation(task, r, identityStepEnabled)) counting.push(r);
    else if (isNearAssignment(task, r.geohashRegion)) notConfirmed += 1;
  }
  // One round only, the same rule as the public page: the reporter's own round when their report
  // counts, else the round with the most. Passes of other rounds may be the same people.
  const perRound = new Map<number, number>();
  for (const r of counting) perRound.set(roundOf(r), (perRound.get(roundOf(r)) ?? 0) + 1);
  const own = counting.find((r) => r.own);
  const have = own ? perRound.get(roundOf(own)) ?? 0 : Math.max(0, ...perRound.values());
  return { have, need: task.confirmations.need, notConfirmed, ownCounts: !!own, highAssurance: task.highAssurance };
}

/** "2 of 3 confirmations". Never claims more than the target. */
export function confirmationsLabel(p: { have: number; need: number }): string {
  return `${Math.min(p.have, p.need)} of ${p.need} confirmations`;
}

/** One plain sentence under the count, or null when there is nothing to add. */
export function confirmationsNote(p: LiveConfirmations): string | null {
  if (p.have >= p.need) return "This activity has the confirmations the programme asked for.";
  if (p.highAssurance && p.notConfirmed > 0) {
    const n = p.notConfirmed;
    return `${n} nearby ${n === 1 ? "report is" : "reports are"} not participant-confirmed, so ${
      n === 1 ? "it does" : "they do"
    } not count for this task.`;
  }
  if (p.notConfirmed > 0) {
    const n = p.notConfirmed;
    return `${n} nearby ${n === 1 ? "report has" : "reports have"} no programme pass, so ${
      n === 1 ? "it does" : "they do"
    } not count.`;
  }
  if (p.highAssurance) return "Only participant-confirmed reports count for this task.";
  return null;
}

/** Hint on the task screen for a second reporter: will their report count here? */
export function confirmationInvite(task: TaskDef, myCell: string | null): string | null {
  if (task.selfStarted || !task.confirmations || !myCell) return null;
  if (!isNearAssignment(task, myCell)) return null;
  return task.highAssurance
    ? "You are near this activity. Your report counts as a community confirmation once it carries your programme pass and is participant-confirmed."
    : "You are near this activity. Your report counts as a community confirmation once it carries your programme pass.";
}

function isReport(v: unknown): v is ConfirmationReport {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  const boolOrNull = (x: unknown) => x === null || typeof x === "boolean";
  return (
    typeof r.own === "boolean" &&
    typeof r.geohashRegion === "string" &&
    boolOrNull(r.verifiedPerson) &&
    boolOrNull(r.verifiedPersonDegraded)
  );
}

/** Validate the api body. Malformed rows are dropped; a malformed body is null. */
export function parseConfirmations(body: unknown): ConfirmationReport[] | null {
  if (!body || typeof body !== "object") return null;
  const list = (body as { reports?: unknown }).reports;
  if (!Array.isArray(list)) return null;
  return list.filter(isReport).map((r) => ({
    own: r.own,
    geohashRegion: r.geohashRegion,
    verifiedPerson: r.verifiedPerson,
    verifiedPersonDegraded: r.verifiedPersonDegraded,
    membershipVerified: (r as unknown as { membershipVerified?: unknown }).membershipVerified === true,
    ...roundField((r as unknown as { round?: unknown }).round),
  }));
}

/** Only a whole, non-negative round survives parsing; anything else is left out (round 0). */
function roundField(v: unknown): { round?: number } {
  return typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? { round: v } : {};
}

/** GET the independent reports for the task of `proofHash`. null on any failure. Never throws. */
export async function fetchConfirmations(
  apiUrl: string,
  proofHash: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ConfirmationReport[] | null> {
  try {
    const res = await fetchImpl(`${apiUrl.replace(/\/+$/, "")}/proof/${encodeURIComponent(proofHash)}/confirmations`);
    if (!res.ok) return null;
    return parseConfirmations(await res.json());
  } catch {
    return null;
  }
}
