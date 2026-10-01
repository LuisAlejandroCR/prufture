// confirmations.ts: groups the stored proofs of one task into independent field reports for the
// public GET /proof/:hash/confirmations route. Pure over Entry[]. Each report carries only a coarse
// region, the liveness verdict, whether it carries a verified programme pass and whether it is the
// caller's own report — never a reportId,
// proofHash, key, review note or precise location. Coordinator-rejected reports are left out.

import { isCommunityConfirmed, type PassReport } from "@proof/core";
import { reportKeyFor, type Entry } from "./store.js";

export interface ConfirmationReport {
  /** True for the report the queried proofHash belongs to. */
  own: boolean;
  /** Coarse cell, same prefix every other public route uses. */
  geohashRegion: string;
  /** true if any photo of the report has a true verdict; false if only false verdicts; null if none. */
  verifiedPerson: boolean | null;
  /** For a false verdict: true only when every false verdict was recorded while degraded. */
  verifiedPersonDegraded: boolean | null;
  /**
   * True if any photo of the report carries a verified programme pass. The pass nullifier is
   * consumed once per (programme, task, epoch), so within an epoch two such rows are two different
   * enrolled members. Boolean only: no nullifier, commitment or programme id leaves this route.
   */
  membershipVerified: boolean;
}

/** Every non-rejected report for the task of `ownHash`, one row per report. null for an unknown hash. */
export function taskReports(entries: Entry[], ownHash: string, regionLen: number): ConfirmationReport[] | null {
  const own = entries.find((e) => e.payload.proofHash === ownHash);
  if (!own) return null;
  const ownKey = reportKeyFor(own);

  const groups = new Map<string, Entry[]>();
  for (const e of entries) {
    if (e.payload.taskId !== own.payload.taskId) continue;
    const key = reportKeyFor(e);
    const list = groups.get(key);
    if (list) list.push(e);
    else groups.set(key, [e]);
  }

  const out: ConfirmationReport[] = [];
  for (const [key, group] of groups) {
    if (group.some((e) => e.review?.status === "rejected")) continue;
    const verdicts = group.filter((e) => typeof e.verifiedPerson === "boolean");
    const anyTrue = verdicts.some((e) => e.verifiedPerson === true);
    const falses = verdicts.filter((e) => e.verifiedPerson === false);
    out.push({
      own: key === ownKey,
      geohashRegion: group[0]!.payload.geohash.slice(0, regionLen),
      verifiedPerson: anyTrue ? true : falses.length > 0 ? false : null,
      verifiedPersonDegraded:
        anyTrue ? false : falses.length > 0 ? falses.every((e) => e.verifiedPersonDegraded === true) : null,
      membershipVerified: group.some((e) => e.membership === "verified"),
    });
  }
  return out;
}

/**
 * True when the report of `ownHash` is community-confirmed: the same rule the public /verify page
 * applies to the rows above (@proof/core isCommunityConfirmed). false for an unknown hash.
 */
export function communityConfirmed(entries: Entry[], ownHash: string, regionLen: number): boolean {
  const own = entries.find((e) => e.payload.proofHash === ownHash);
  const reports = taskReports(entries, ownHash, regionLen);
  if (!own || !reports) return false;
  return isCommunityConfirmed(own.payload.geohash.slice(0, regionLen), reports);
}

/**
 * The proofHashes that are community-confirmed, for the whole store at once (GET /proofs). Same
 * answer as communityConfirmed() for every proof, without rebuilding a task's reports per proof:
 * a task's reports are grouped once and each proof is judged against them.
 */
export function communityConfirmedHashes(entries: Entry[], regionLen: number): Set<string> {
  const byTask = new Map<string, Map<string, Entry[]>>();
  for (const e of entries) {
    let groups = byTask.get(e.payload.taskId);
    if (!groups) byTask.set(e.payload.taskId, (groups = new Map()));
    const key = reportKeyFor(e);
    const list = groups.get(key);
    if (list) list.push(e);
    else groups.set(key, [e]);
  }

  const out = new Set<string>();
  for (const groups of byTask.values()) {
    // Only the rows that can count: not rejected and carrying a pass (the rule skips the rest).
    const passRows: { key: string; geohashRegion: string }[] = [];
    for (const [key, group] of groups) {
      if (group.some((e) => e.review?.status === "rejected")) continue;
      if (!group.some((e) => e.membership === "verified")) continue;
      passRows.push({ key, geohashRegion: group[0]!.payload.geohash.slice(0, regionLen) });
    }
    if (passRows.length === 0) continue;
    for (const [key, group] of groups) {
      const rows: PassReport[] = passRows.map((r) => ({
        own: r.key === key,
        geohashRegion: r.geohashRegion,
        membershipVerified: true,
      }));
      for (const e of group) {
        if (isCommunityConfirmed(e.payload.geohash.slice(0, regionLen), rows)) out.add(e.payload.proofHash);
      }
    }
  }
  return out;
}
