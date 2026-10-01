import "react-native-get-random-values";
// Second, right after the crypto shim: the background notices task must be defined at load, because
// the system can start the app in the background only to run it.
import "../src/background-task-define";
// _layout.tsx: root navigation stack for the Expo Router app (tabs live in app/(tabs)/_layout.tsx).
// The crypto shim above MUST stay the first statement: it binds crypto.getRandomValues before
// @proof/core's ed25519 is first touched by the keystore on launch. The native splash is held until
// the animated LaunchSplash is on screen, then handed off so the sprout mark never flickers.

import { useCallback, useEffect, useRef, useState } from "react";
import { Platform, View } from "react-native";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { LaunchSplash } from "../src/components/LaunchSplash";
import { announce, connectivityChange, syncResult } from "../src/announce";
import { color } from "../src/theme";
import { useOnline } from "../src/useOnline";
import { API_URL, useAutoSync } from "../src/useAutoSync";
import { registerBackgroundNotices } from "../src/background-notices";
import { runReportNotices } from "../src/local-notices";
import { listProofs } from "../src/queue";
import { askNotificationPermission, notifyReportConfirmed } from "../src/notifications";
import { configurePurchasesForPlatform } from "../src/purchases";

// Keep the native splash until the animated one has painted. Never throws (Expo Go, tests).
SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  const [launching, setLaunching] = useState(true);
  const handOff = useCallback(() => {
    SplashScreen.hideAsync().catch(() => undefined);
  }, []);
  const done = useCallback(() => setLaunching(false), []);

  // Permission for local notices (worked out on this phone). Denied -> the app is unchanged.
  useEffect(() => {
    void askNotificationPermission();
    // Let the system run the notices now and then while the app is closed (if a switch needs it).
    void registerBackgroundNotices();
  }, []);

  // Configure RevenueCat once per launch with the platform's PUBLIC key. Without this the SDK
  // is never initialised and every entitlement check degrades — which the paywall renders as
  // "unavailable", never as "free". No key configured (e.g. Expo Go) is a silent no-op.
  useEffect(() => {
    void configurePurchasesForPlatform(Platform.OS);
  }, []);

  // Drain the offline queue when coverage returns or the app is foregrounded.
  // When a sync confirms a report, fire the local "confirmed" notification as a
  // fallback for when no server push is delivered.
  useAutoSync((summary) => {
    if (summary.attested > 0) void notifyReportConfirmed(summary.attested);
    void announce(syncResult(summary, false));
    // Confirmed by the community, photo requested: worked out on this phone, shown locally.
    void listProofs()
      .then((rows) => runReportNotices(API_URL, rows))
      .catch(() => undefined);
  });

  // Tell a VoiceOver user when signal drops or returns; the Offline pill alone is visual.
  const online = useOnline();
  const lastOnline = useRef<boolean | null>(null);
  useEffect(() => {
    void announce(connectivityChange(lastOnline.current, online));
    lastOnline.current = online;
  }, [online]);

  return (
    <SafeAreaProvider>
      <View style={{ flex: 1, backgroundColor: color.background }} onLayout={handOff}>
        {/* Expo SDK 54 enforces edge-to-edge and expo-status-bar no longer exposes the
            Android backgroundColor/translucent props, so drawing under the bar is
            prevented by the safe-area top pad in <Screen> (see src/components/ui.tsx),
            not here. Adding expo-system-ui would be a native config-plugin dependency. */}
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: color.background },
            animation: "slide_from_right",
          }}
        >
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="task/[id]" />
          <Stack.Screen name="report/pick" />
          <Stack.Screen name="report/intro" />
          <Stack.Screen name="report/permissions" />
          <Stack.Screen name="report/identity" />
          <Stack.Screen name="report/capture" />
          <Stack.Screen name="report/questions" />
          <Stack.Screen name="report/location" />
          <Stack.Screen name="report/review" />
          <Stack.Screen name="report/saved" options={{ animation: "fade", gestureEnabled: false }} />
          <Stack.Screen name="report/sending" options={{ gestureEnabled: false }} />
          <Stack.Screen name="report/sent" options={{ animation: "fade", gestureEnabled: false }} />
          <Stack.Screen name="status/[id]" />
          <Stack.Screen name="help" />
          <Stack.Screen name="support" />
          <Stack.Screen name="data-privacy" />
          <Stack.Screen name="face-check" />
          <Stack.Screen name="programme-pass" />
          <Stack.Screen name="accessibility" />
          <Stack.Screen name="notifications" />
          <Stack.Screen name="about" />
          <Stack.Screen name="coordinator" />
          <Stack.Screen name="paywall" />
          <Stack.Screen name="zk-bench" />
        </Stack>
        {launching ? <LaunchSplash onDone={done} /> : null}
      </View>
    </SafeAreaProvider>
  );
}
