// sample.ts: which public report the landing's "Explore a real report" opens. A fixed hash breaks the
// moment the store no longer holds it (a reset disk, a new environment), and a visitor then lands on
// "Report not found". So the link goes through /verify/sample, which picks a report that exists now.
// Pure, so the choice is tested.

import type { ProofSummary } from "./api";

/**
 * The preferred hash when the store has it; otherwise the newest community-confirmed report, then
 * the newest anchored one, then the newest of any. null for an empty store.
 */
export function pickSampleHash(proofs: ProofSummary[], preferred?: string | null): string | null {
  if (preferred && proofs.some((p) => p.proofHash === preferred)) return preferred;
  const newest = (list: ProofSummary[]) =>
    list.reduce<ProofSummary | null>((best, p) => {
      const t = Date.parse(p.capturedAt);
      if (Number.isNaN(t)) return best ?? p;
      if (!best) return p;
      const b = Date.parse(best.capturedAt);
      return Number.isNaN(b) || t > b ? p : best;
    }, null);
  const pick =
    newest(proofs.filter((p) => p.communityConfirmed === true)) ??
    newest(proofs.filter((p) => p.attestationCount >= 1)) ??
    newest(proofs);
  return pick?.proofHash ?? null;
}
