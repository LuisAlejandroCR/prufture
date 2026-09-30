// assurance.ts: the two separate assurance facts on the public /verify/[hash] page. The face check
// comes from the liveness verdict (verifiedPerson); the anonymous programme pass comes only from a
// verified Semaphore membership. A face check is never shown as a pass. The apps do not share code.

export type Assurance = "verified" | "invalid" | "reused" | "unavailable" | "not_enrolled";

const LABELS: Record<Assurance, string> = {
  verified: "Anonymous pass confirmed",
  invalid: "Anonymous pass could not be confirmed",
  reused: "This pass was already used for this task",
  unavailable: "Anonymous pass could not be checked",
  not_enrolled: "This report has not been participant-confirmed",
};

export function assuranceLabel(a: Assurance): string {
  return LABELS[a];
}

/**
 * `verifiedPerson === null`: no verdict was ever attached — treated as "not_enrolled" (the
 * default journey never runs the identity step, so this is the common case).
 * `true`: "verified". `false` with `verifiedPersonDegraded === true`: "unavailable" — the
 * provider was down, never a failed check. `false` otherwise: "invalid".
 */
export function assuranceFromProof(proof: {
  verifiedPerson: boolean | null;
  verifiedPersonDegraded?: boolean | null;
}): Assurance {
  if (proof.verifiedPerson === null) return "not_enrolled";
  if (proof.verifiedPerson === true) return "verified";
  return proof.verifiedPersonDegraded ? "unavailable" : "invalid";
}

/** Only a "verified" assurance may be shown as participant-confirmed. */
export function countsAsParticipantConfirmed(a: Assurance): boolean {
  return a === "verified";
}

const FACE_CHECK_LABELS: Record<Assurance, string> = {
  verified: "Passed",
  invalid: "Did not pass",
  unavailable: "Could not be checked",
  not_enrolled: "Not run",
  reused: "Not run",
};

/** Face check (liveness) wording for the same states. Only ever describes the face check. */
export function faceCheckLabel(a: Assurance): string {
  return FACE_CHECK_LABELS[a];
}

/** The programme pass is confirmed only by a verified group membership, never by a face check. */
export function passLabel(membership: "verified" | null): string {
  return membership === "verified" ? LABELS.verified : LABELS.not_enrolled;
}

/** Neutral (non-error) assurance states — never rendered with a failure/error badge. */
export function isNeutralAssurance(a: Assurance): boolean {
  return a === "not_enrolled" || a === "unavailable";
}
