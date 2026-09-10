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
