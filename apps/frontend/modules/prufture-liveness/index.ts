// index.ts: JS face of the PruftureLiveness native module (AWS Face Liveness, iOS only for now).
// Null in Expo Go, on Android, or without the module: callers treat that as "unavailable".

import { requireOptionalNativeModule } from "expo";

export type LivenessCaptureResult = { status: "completed" } | { status: "failed"; code: string };

interface PruftureLivenessNative {
  isConfigured(): boolean;
  configure(identityPoolId: string, region: string): Promise<void>;
  start(sessionId: string, region: string): Promise<LivenessCaptureResult>;
}

const native = requireOptionalNativeModule<PruftureLivenessNative>("PruftureLiveness");

export function livenessModuleAvailable(): boolean {
  return native !== null;
}

export async function configureLiveness(identityPoolId: string, region: string): Promise<boolean> {
  if (!native) return false;
  await native.configure(identityPoolId, region);
  return native.isConfigured();
}

/** Runs the capture for a session the api created. The verdict comes from the api, not from here. */
export async function startLivenessCapture(sessionId: string, region: string): Promise<LivenessCaptureResult> {
  if (!native || !native.isConfigured()) return { status: "failed", code: "unavailable" };
  return native.start(sessionId, region);
}
