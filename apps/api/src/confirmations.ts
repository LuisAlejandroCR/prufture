// confirmations.ts: groups the stored proofs of one task into independent field reports for the
// public GET /proof/:hash/confirmations route. Pure over Entry[]. Each report carries only a coarse
// region, the liveness verdict and whether it is the caller's own report — never a reportId,
// proofHash, key, review note or precise location. Coordinator-rejected reports are left out.

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
    });
  }
  return out;
}
