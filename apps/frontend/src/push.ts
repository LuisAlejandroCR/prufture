// push.ts: pure helpers for anonymous push-token registration.
// No native imports so it unit-tests off-device. The register body is built from an
// explicit whitelist — a device id and an Expo push token, nothing that identifies a person.
// Native glue (permission prompt, token fetch, POST) lives in src/notifications.ts.

/** Exact shape POSTed to `${apiUrl}/register-push`. No account, no identity, no proof link. */
export interface RegisterPushBody {
  deviceId: string;
  token: string;
}

/** Build the register body from a whitelist. Spreading a larger object can never leak here. */
export function toRegisterBody(deviceId: string, token: string): RegisterPushBody {
  return { deviceId, token };
}

/** Expo push tokens look like `ExponentPushToken[xxxxxxxx]` or `ExpoPushToken[xxxx]`. */
export function isExpoPushToken(value: unknown): value is string {
  return typeof value === "string" && /^Expo(nent)?PushToken\[[^\]]+\]$/.test(value);
}

/** 16 random bytes -> lowercase hex. Anonymous, stored once in secure-store, reused. */
export function randomDeviceId(getRandomValues: (a: Uint8Array) => Uint8Array): string {
  const bytes = getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
