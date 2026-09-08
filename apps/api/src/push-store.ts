// push-store.ts: anonymous Expo push tokens, keyed by a random device id.
// No account, no identity, no link to any proofHash — by construction this cannot
// tell you who filed what. In-memory only: a token is disposable and re-registered
// on every app launch. Kept separate from store.ts so the proof persistence and its
// tests are untouched.

export interface PushRegistration {
  deviceId: string;
  token: string;
  registeredAt: string;
}

const byDeviceId = new Map<string, PushRegistration>();

/** Expo push token format guard — same check the client applies before sending. */
export function isExpoPushToken(value: unknown): value is string {
  return typeof value === "string" && /^Expo(nent)?PushToken\[[^\]]+\]$/.test(value);
}

/** Upsert by deviceId. Returns false for a malformed device id or token (no throw). */
export function registerPushToken(deviceId: unknown, token: unknown): boolean {
  if (typeof deviceId !== "string" || !/^[0-9a-f]{8,64}$/.test(deviceId)) return false;
  if (!isExpoPushToken(token)) return false;
  byDeviceId.set(deviceId, { deviceId, token, registeredAt: new Date().toISOString() });
  return true;
}

export function allPushTokens(): string[] {
  return [...new Set([...byDeviceId.values()].map((r) => r.token))];
}

export function pushRegistrationCount(): number {
  return byDeviceId.size;
}

/** Test-only: drop all registrations. */
export function __resetPushStoreForTests(): void {
  byDeviceId.clear();
}
