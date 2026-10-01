// notifications.ts: push through OneSignal, plus the local "recorded publicly" notification
// (expo-notifications, which OneSignal does not replace: it has no local notifications).
// Push is anonymous and consent-first: OneSignal collects nothing until the person allows
// notifications, and the app never logs in, tags, aliases or shares location with it, so a
// subscription is never tied to a person or a report. Both modules are lazy-imported and skipped in
// Expo Go, where importing them crashes at boot.

import Constants from "expo-constants";
import * as Device from "expo-device";
import { oneSignalAppId } from "./push";

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

export interface PushResult {
  subscribed: boolean;
  reason?: "not-a-device" | "permission-denied" | "not-configured" | "error" | "unsupported";
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
 * Start OneSignal push. Never throws; the app never depends on the result. OneSignal is told consent
 * is required before it starts, and is given consent only if the person allows notifications.
 */
export async function startPush(appId: string | null = oneSignalAppId()): Promise<PushResult> {
  try {
    if (!appId) return { subscribed: false, reason: "not-configured" };
    if (IN_EXPO_GO) return { subscribed: false, reason: "unsupported" };
    if (!Device.isDevice) return { subscribed: false, reason: "not-a-device" };

    // The Android channel for the local notification below; OneSignal manages its own.
    const Notifications = await loadNotifications();
    if (Notifications) await ensureAndroidChannel(Notifications);

    const { OneSignal } = await import("react-native-onesignal");
    OneSignal.setConsentRequired(true);
    OneSignal.initialize(appId);
    const granted = await OneSignal.Notifications.requestPermission(false);
    OneSignal.setConsentGiven(granted);
    return granted ? { subscribed: true } : { subscribed: false, reason: "permission-denied" };
  } catch {
    return { subscribed: false, reason: "error" };
  }
}

/** Local "your report was confirmed" notification. Used when no server push arrives. */
export async function notifyReportConfirmed(count = 1): Promise<void> {
  try {
    const Notifications = await loadNotifications();
    if (!Notifications) return; // Expo Go / unsupported: silently skip.
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Your report was recorded publicly",
        body:
          count > 1
            ? `${count} of your reports now have a public, tamper-proof record.`
            : "A report you filed now has a public, tamper-proof record.",
      },
      trigger: null,
    });
  } catch {
    // Notifications unavailable (permission off, unsupported): silently skip.
  }
}
