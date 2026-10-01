// notifications.ts: LOCAL notifications only. The phone works out its own notices (src/local-notices.ts)
// and shows them itself, so no push token, device id or report reference ever leaves it.
// expo-notifications is lazy-imported and skipped in Expo Go, where importing it crashes at boot.

import Constants from "expo-constants";
import * as Device from "expo-device";

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

async function ensureAndroidChannel(Notifications: NotificationsModule): Promise<void> {
  try {
    await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL, {
      name: "Report updates",
      importance: Notifications.AndroidImportance.DEFAULT,
      lightColor: "#C8533A",
    });
  } catch {
    // Non-Android or unsupported: local notifications still work without a channel.
  }
}

export type PermissionResult = "granted" | "denied" | "unsupported";

/** Ask once for permission to show local notices. Never throws; denied leaves the app unchanged. */
export async function askNotificationPermission(): Promise<PermissionResult> {
  try {
    const Notifications = await loadNotifications();
    if (!Notifications || !Device.isDevice) return "unsupported";
    await ensureAndroidChannel(Notifications);
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return "granted";
    if (!current.canAskAgain) return "denied";
    return (await Notifications.requestPermissionsAsync()).granted ? "granted" : "denied";
  } catch {
    return "unsupported";
  }
}

/** Show one local notification now. Never throws; without permission it is simply not shown. */
export async function showLocalNotice(title: string, body: string): Promise<void> {
  try {
    const Notifications = await loadNotifications();
    if (!Notifications) return; // Expo Go / unsupported: silently skip.
    await Notifications.scheduleNotificationAsync({ content: { title, body }, trigger: null });
  } catch {
    // Notifications unavailable (permission off, unsupported): silently skip.
  }
}

// Saturday 10:00, local time: a calm moment, never at night.
const WEEKLY_AT = { weekday: 7, hour: 10, minute: 0 };

/** Replace the weekly local notification `id`. Never throws. */
export async function scheduleWeeklyNotice(id: string, title: string, body: string): Promise<void> {
  try {
    const Notifications = await loadNotifications();
    if (!Notifications) return;
    await Notifications.scheduleNotificationAsync({
      identifier: id,
      content: { title, body },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.WEEKLY, ...WEEKLY_AT },
    });
  } catch {
    // Not scheduled: the reminder is an extra.
  }
}

export async function cancelScheduledNotice(id: string): Promise<void> {
  try {
    const Notifications = await loadNotifications();
    await Notifications?.cancelScheduledNotificationAsync(id);
  } catch {
    // Nothing scheduled, or unsupported.
  }
}

/** Local "your report was recorded publicly" notification after a sync pass. */
export async function notifyReportConfirmed(count = 1): Promise<void> {
  await showLocalNotice(
    "Your report was recorded publicly",
    count > 1
      ? `${count} of your reports now have a public, tamper-proof record.`
      : "A report you filed now has a public, tamper-proof record.",
  );
}
