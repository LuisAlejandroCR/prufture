// limits.ts: size caps for the public payload fields, enforced at the api trust boundary.
//
// Why these exist at all: taskId and capturedAt are inside the SIGNED payload, and the signature
// is made by a self-generated key — there is no registration, so anyone can sign a proof. Those
// fields then travel into EAS calldata, which the relayer pays gas for, and into the durable
// store. EVM calldata is charged per byte, so an unbounded taskId lets an unauthenticated caller
// spend the programme's gas-only key at will, and grow the store file without limit.
//
// The api cannot trim a signed field without invalidating the signature — the same constraint
// that applies to an over-precise geohash — so an oversized field is REJECTED, not truncated.
//
// The caps are deliberately far above real values: the longest taskId the dashboard recognises
// is "latrine-construction" (20 characters) and capturedAt is an ISO-8601 instant (~24).

/** Max characters for `taskId`. Real values are ~20; this leaves generous room. */
export const MAX_TASK_ID_LEN = 64;

/** Max characters for `capturedAt`. An ISO-8601 instant is ~24. */
export const MAX_CAPTURED_AT_LEN = 64;

/** Max characters for the optional, UNSIGNED `reportId` grouping key (a uuid is 36). */
export const MAX_REPORT_ID_LEN = 64;

/** Max characters for `proofHash`: sha256 hex, optionally 0x-prefixed. */
export const MAX_PROOF_HASH_LEN = 66;

export interface FieldLimitViolation {
  field: string;
  maxLength: number;
}

/**
 * First oversized public-payload field, or null when all are within their cap.
 * Checks length only — shape and signature are validated separately.
 */
export function firstOversizedField(payload: {
  proofHash?: unknown;
  taskId?: unknown;
  capturedAt?: unknown;
}): FieldLimitViolation | null {
  const checks: [string, unknown, number][] = [
    ["proofHash", payload.proofHash, MAX_PROOF_HASH_LEN],
    ["taskId", payload.taskId, MAX_TASK_ID_LEN],
    ["capturedAt", payload.capturedAt, MAX_CAPTURED_AT_LEN],
  ];
  for (const [field, value, maxLength] of checks) {
    if (typeof value === "string" && value.length > maxLength) return { field, maxLength };
  }
  return null;
}
