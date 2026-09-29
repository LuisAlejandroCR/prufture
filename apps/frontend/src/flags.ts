// flags.ts: feature flags read from build-time env vars. Kept tiny and pure so screens
// can branch on them without reaching into process.env directly.

/** Selfie liveness step in the default reporter journey. Off unless explicitly turned on. */
export function identityStepEnabled(): boolean {
  return process.env.EXPO_PUBLIC_IDENTITY_STEP === "on";
}

/**
 * Where report/permissions.tsx navigates once both permissions are granted. Pulled out as a
 * pure helper so the default (flag off) nav path — capture, never identity — is unit-testable
 * without rendering the screen.
 */
export function nextAfterPermissions(taskId: string): { pathname: string; params: Record<string, string> } {
  return identityStepEnabled()
    ? { pathname: "/report/identity", params: { id: taskId } }
    : { pathname: "/report/capture", params: { id: taskId, step: "0" } };
}

export type PersonhoodProvider = "off" | "semaphore";

/** Programme-pass membership proof. "semaphore" only when set to exactly that; anything else is off. */
export function personhoodProvider(): PersonhoodProvider {
  return process.env.EXPO_PUBLIC_PERSONHOOD_PROVIDER === "semaphore" ? "semaphore" : "off";
}

const PROGRAMME_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** The programme whose group this build proves membership of; null when unset or malformed. */
export function personhoodProgrammeId(): string | null {
  const v = process.env.EXPO_PUBLIC_PERSONHOOD_PROGRAMME_ID?.trim();
  return v && PROGRAMME_ID.test(v) ? v : null;
}
