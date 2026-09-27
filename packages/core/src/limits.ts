// limits.ts: size caps for the public payload fields, enforced at the api trust boundary. Signed
// fields come from self-generated keys and end up in gas-paid EAS calldata and the store, so an
// oversized field is REJECTED (trimming would break the signature). Caps sit far above real values.

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
