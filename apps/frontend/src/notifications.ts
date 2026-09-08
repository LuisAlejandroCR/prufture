// notifications.ts: report-status push, anonymous by construction.
// registerForPush() asks for the OS notification permission (POST_NOTIFICATIONS on Android 13+),
// gets the Expo push token, and POSTs it with a random device id — never an account, an identity,
// or a proof reference. No permission -> the app behaves exactly as before, just without push.
// notifyReportConfirmed() is the local fallback fired by useAutoSync when a report is confirmed.
// Pure helpers (payload whitelist, token check) live in src/push.ts so they stay unit-testable.

import Constants from "expo-constants";
import * as Crypto from "expo-crypto";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { isExpoPushToken, randomDeviceId, toRegisterBody } from "./push";

const DEVICE_ID_KEY = "prufture.push.deviceId";
const ANDROID_CHANNEL = "default";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export interface RegisterResult {
  registered: boolean;
  reason?: "not-a-device" | "permission-denied" | "no-project-id" | "error";
}

async function getOrCreateDeviceId(): Promise<string> {
  const existing = await SecureStore.getItemAsync(DEVICE_ID_KEY);
  if (existing) return existing;
  const fresh = randomDeviceId((a) => Crypto.getRandomValues(a));
  await SecureStore.setItemAsync(DEVICE_ID_KEY, fresh);
  return fresh;
}

async function ensureAndroidChannel(): Promise<void> {
  try {
    await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL, {
      name: "Report updates",
      importance: Notifications.AndroidImportance.DEFAULT,
      lightColor: "#C8533A",
    });
  } catch {
    // Non-Android or unsupported: local + remote notifications still work without a channel.
  }
}

/**
 * Best-effort push registration. Never throws. Returns why it stopped so the caller can log,
 * but the app never depends on the result — push is additive.
 */
export async function registerForPush(apiUrl: string): Promise<RegisterResult> {
  try {
    if (!Device.isDevice) return { registered: false, reason: "not-a-device" };

    await ensureAndroidChannel();

    const current = await Notifications.getPermissionsAsync();
    let granted = current.granted;
    if (!granted && current.canAskAgain) {
      granted = (await Notifications.requestPermissionsAsync()).granted;
    }
    if (!granted) return { registered: false, reason: "permission-denied" };

    const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
    if (!projectId) return { registered: false, reason: "no-project-id" };

    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    if (!isExpoPushToken(token)) return { registered: false, reason: "error" };

    const deviceId = await getOrCreateDeviceId();
    const res = await fetch(`${apiUrl.replace(/\/+$/, "")}/register-push`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(toRegisterBody(deviceId, token)),
    });
    return { registered: res.ok, reason: res.ok ? undefined : "error" };
  } catch {
    return { registered: false, reason: "error" };
  }
}

/** Local "your report was confirmed" notification. Used when no server push arrives. */
export async function notifyReportConfirmed(count = 1): Promise<void> {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Your report was confirmed",
        body:
          count > 1
            ? `${count} of your reports were confirmed by the programme team.`
            : "A report you filed was confirmed by the programme team.",
      },
      trigger: null,
    });
  } catch {
    // Notifications unavailable (permission off, unsupported): silently skip.
  }
}
