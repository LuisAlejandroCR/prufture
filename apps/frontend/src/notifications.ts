// notifications.ts: anonymous report-status push — registers an Expo token with a random device id
// (never an account, identity or proof reference) plus a local "confirmed" fallback. expo-notifications
// is lazy-imported and skipped in Expo Go, where importing it crashes on PushNotificationIOS at boot.

import Constants from "expo-constants";
import * as Crypto from "expo-crypto";
import * as Device from "expo-device";
import * as SecureStore from "expo-secure-store";
import { isExpoPushToken, randomDeviceId, toRegisterBody } from "./push";

const DEVICE_ID_KEY = "prufture.push.deviceId";
const ANDROID_CHANNEL = "default";

// Expo Go identifies as "storeClient" (executionEnvironment) or "expo" (appOwnership).
// Check both: the values have shifted across SDKs and a single miss means
// `await import("expo-notifications")` runs in Expo Go and crashes on PushNotificationIOS.
const IN_EXPO_GO =
  Constants.executionEnvironment === "storeClient" || Constants.appOwnership === "expo";

type NotificationsModule = typeof import("expo-notifications");
let notificationsModule: NotificationsModule | null = null;
let handlerSet = false;

/** Lazy-load expo-notifications. Returns null in Expo Go or if the module fails to load. */
async function loadNotifications(): Promise<NotificationsModule | null> {
  if (IN_EXPO_GO) return null;
  if (notificationsModule) return notificationsModule;
  try {
    notificationsModule = await import("expo-notifications");
    if (!handlerSet) {
      notificationsModule.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: false,
          shouldSetBadge: false,
        }),
      });
      handlerSet = true;
    }
    return notificationsModule;
  } catch {
    return null;
  }
}

export interface RegisterResult {
  registered: boolean;
  reason?: "not-a-device" | "permission-denied" | "no-project-id" | "error" | "unsupported";
}

async function getOrCreateDeviceId(): Promise<string> {
  const existing = await SecureStore.getItemAsync(DEVICE_ID_KEY);
  if (existing) return existing;
  const fresh = randomDeviceId((a) => Crypto.getRandomValues(a));
  await SecureStore.setItemAsync(DEVICE_ID_KEY, fresh);
  return fresh;
}

async function ensureAndroidChannel(Notifications: NotificationsModule): Promise<void> {
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
    const Notifications = await loadNotifications();
    if (!Notifications) return { registered: false, reason: "unsupported" };
    if (!Device.isDevice) return { registered: false, reason: "not-a-device" };

    await ensureAndroidChannel(Notifications);

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
    const Notifications = await loadNotifications();
    if (!Notifications) return; // Expo Go / unsupported: silently skip.
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
