// cutover.ts: provider-portability phase 4 — run incumbent and candidate adapters side by side and
// compare TYPED OUTCOMES before switching a boundary. Enforces synthetic-only payloads (a real proof is
// refused before either adapter is called), and reports only availability and calldata agreement.

import { hashBytes, type ExternalResult, type ProofPublicPayload } from "@proof/core";
import type { AttestationSubmitter } from "./submitter.js";
import { buildAttestRequest } from "./relayer-request.js";

/** Reserved taskId prefix. A real programme task must never use it. */
export const SYNTHETIC_TASK_PREFIX = "synthetic-";

/** Domain separator, so a synthetic hash cannot collide with a hash of real captured media. */
const SYNTHETIC_DOMAIN = "prufture-synthetic:";

const encoder = new TextEncoder();

/**
 * The proofHash a synthetic payload must carry. Derived from the payload's own public fields, so
 * a real media hash cannot be smuggled through by simply renaming the task.
 */
export function syntheticProofHash(taskId: string, capturedAt: string): string {
  return hashBytes(encoder.encode(`${SYNTHETIC_DOMAIN}${taskId}:${capturedAt}`));
}

/** Build a payload that is, by construction, not derived from any real capture. */
export function syntheticPayload(n: number, capturedAt = "2026-01-01T00:00:00.000Z"): ProofPublicPayload {
  const taskId = `${SYNTHETIC_TASK_PREFIX}${n}`;
  return { proofHash: syntheticProofHash(taskId, capturedAt), taskId, geohash: "u4pru", capturedAt };
}

/**
 * True only for a payload this module could have produced. Both conditions matter: the reserved
 * prefix makes intent explicit, and the recomputed hash makes it unforgeable.
 */
export function isSyntheticPayload(p: ProofPublicPayload): boolean {
  if (typeof p?.taskId !== "string" || !p.taskId.startsWith(SYNTHETIC_TASK_PREFIX)) return false;
  if (typeof p.proofHash !== "string" || typeof p.capturedAt !== "string") return false;
  return p.proofHash.toLowerCase().replace(/^0x/, "") === syntheticProofHash(p.taskId, p.capturedAt);
}

/** What a side-by-side run is allowed to tell the operator. */
export interface ComparisonRow {
  /** The incumbent adapter's name. */
  incumbent: string;
  /** The candidate adapter's name. */
  candidate: string;
  /** "both-available" | "both-unavailable" | "diverged" */
  outcome: "both-available" | "both-unavailable" | "diverged";
  /**
   * True when the shared pure builder produced byte-identical calldata across independent
   * builds of the same payload. Both adapters use that one builder, so this is what makes
   * "the candidate would put the same bytes on the wire" checkable without sending anything.
   */
  calldataDeterministic: boolean;
  /** True when the two adapters agree on availability. */
  agrees: boolean;
}

function outcomeOf(a: ExternalResult<unknown>, b: ExternalResult<unknown>): ComparisonRow["outcome"] {
  if (a.available && b.available) return "both-available";
  if (!a.available && !b.available) return "both-unavailable";
  return "diverged";
}

/**
 * Run two submitters over one synthetic payload and compare their typed outcomes.
 *
 * Throws on a non-synthetic payload — the refusal happens BEFORE either adapter is called, so a
 * real proof can never reach a candidate provider during an evaluation.
 */
export async function compareSubmitters(
  incumbent: AttestationSubmitter,
  candidate: AttestationSubmitter,
  payload: ProofPublicPayload,
): Promise<ComparisonRow> {
  if (!isSyntheticPayload(payload)) {
    throw new Error("cutover: refusing to compare adapters with a non-synthetic payload");
  }

  // Both adapters share relayer-request.ts, so the bytes can only differ if the builder is not
  // deterministic. Build twice, independently, and compare — a real check, not a restatement.
  const first = buildAttestRequest(payload).args[0].data.data;
  const second = buildAttestRequest({ ...payload }).args[0].data.data;
  const calldataDeterministic = first === second;

  const [a, b] = await Promise.all([incumbent.submit(payload), candidate.submit(payload)]);

  return {
    incumbent: incumbent.name,
    candidate: candidate.name,
    outcome: outcomeOf(a, b),
    calldataDeterministic,
    agrees: a.available === b.available,
  };
}

/**
 * Whether a cutover may proceed: every row agreed and produced identical calldata. A single
 * divergence holds the switch, which is what keeps the previous adapter available for rollback
 * through the observation window.
 */
export function cutoverReady(rows: ComparisonRow[]): boolean {
  return rows.length > 0 && rows.every((r) => r.agrees && r.calldataDeterministic);
}
