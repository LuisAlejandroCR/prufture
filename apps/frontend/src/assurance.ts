// assurance.ts: the explicit personhood-assurance states shown to a reporter, mapped from the
// server's verifiedPerson / verifiedPersonDegraded. One pure module so every screen uses the same
// wording — no screen should ever compare verifiedPerson === false directly.

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
 * Map the server's /proof/:hash liveness fields onto an Assurance.
 * - `verifiedPerson === null` (no verdict was ever attached): "not_enrolled" when the identity
 *   step is off (the default journey never runs a check), else "unavailable" (the step ran but
 *   Neuro never returned a verdict onto this proof).
 * - `verifiedPerson === true`: "verified".
 * - `verifiedPerson === false` with `verifiedPersonDegraded === true`: "unavailable" — the
 *   provider was down, this is NOT a failed check. Must never collapse into "invalid".
 * - `verifiedPerson === false` otherwise: "invalid".
 */
export function assuranceFromProof(proof: {
  verifiedPerson: boolean | null;
  verifiedPersonDegraded?: boolean | null;
}, identityStepEnabled: boolean): Assurance {
  if (proof.verifiedPerson === null) return identityStepEnabled ? "unavailable" : "not_enrolled";
  if (proof.verifiedPerson === true) return "verified";
  return proof.verifiedPersonDegraded ? "unavailable" : "invalid";
}

/**
 * Whether a report may be shown with the "confirmed by a participant" affordance. Only an
 * actually-verified assurance counts — everything else can still be saved, synced, attested
 * and shown, just not presented as participant-confirmed.
 */
export function countsAsParticipantConfirmed(a: Assurance): boolean {
  return a === "verified";
}
