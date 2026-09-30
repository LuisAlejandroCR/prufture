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

export type LivenessProvider = "off" | "aws";

/** One-time live-person face check (AWS Face Liveness). "aws" only when set to exactly that; anything else is off. */
export function livenessProvider(): LivenessProvider {
  return process.env.EXPO_PUBLIC_LIVENESS_PROVIDER === "aws" ? "aws" : "off";
}

const AWS_REGION = /^[a-z]{2}(-[a-z]+)+-\d$/;
const IDENTITY_POOL_ID = /^[a-z]{2}(-[a-z]+)+-\d:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export interface FaceLivenessConfig {
  /** Must equal the api's AWS_REGION: the session is created there and streamed to there. */
  region: string;
  /** Cognito identity pool whose guest role may only call rekognition:StartFaceLivenessSession. */
  identityPoolId: string;
  /** The identity pool's own region, read from its id prefix. May differ from `region`. */
  identityPoolRegion: string;
}

/** What the native capture needs; null when either value is unset or malformed. */
export function faceLivenessConfig(): FaceLivenessConfig | null {
  const region = process.env.EXPO_PUBLIC_AWS_REGION?.trim() ?? "";
  const identityPoolId = process.env.EXPO_PUBLIC_LIVENESS_IDENTITY_POOL_ID?.trim() ?? "";
  if (!AWS_REGION.test(region) || !IDENTITY_POOL_ID.test(identityPoolId)) return null;
  return { region, identityPoolId, identityPoolRegion: identityPoolId.split(":")[0]! };
}
