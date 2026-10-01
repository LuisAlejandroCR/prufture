// push.ts: pure push helpers, no native imports, so they test off-device. Push goes through OneSignal
// (src/notifications.ts); the app id is public build config (EXPO_PUBLIC_ONESIGNAL_APP_ID).

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The OneSignal app id, or null when it is missing or malformed: push then stays off. */
export function oneSignalAppId(env: Record<string, string | undefined> = process.env): string | null {
  const id = env.EXPO_PUBLIC_ONESIGNAL_APP_ID?.trim().toLowerCase() ?? "";
  return UUID.test(id) ? id : null;
}
