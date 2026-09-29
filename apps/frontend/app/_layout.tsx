import "react-native-get-random-values";
// _layout.tsx: root navigation stack for the Expo Router app (tabs live in app/(tabs)/_layout.tsx).
// The crypto shim above MUST stay the first statement: it binds crypto.getRandomValues before
// @proof/core's ed25519 is first touched by the keystore on launch. The native splash is held until
// the animated LaunchSplash is on screen, then handed off so the sprout mark never flickers.

import { useCallback, useEffect, useState } from "react";
import { Platform, View } from "react-native";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { LaunchSplash } from "../src/components/LaunchSplash";
import { color } from "../src/theme";
import { API_URL, useAutoSync } from "../src/useAutoSync";
import { notifyReportConfirmed, registerForPush } from "../src/notifications";
import { configurePurchasesForPlatform } from "../src/purchases";

// Keep the native splash until the animated one has painted. Never throws (Expo Go, tests).
SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  const [launching, setLaunching] = useState(true);
  const handOff = useCallback(() => {
    SplashScreen.hideAsync().catch(() => undefined);
  }, []);
  const done = useCallback(() => setLaunching(false), []);

  // Anonymous push registration: no permission -> the app is unchanged, just no push.
  useEffect(() => {
    void registerForPush(API_URL);
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
  });

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
        </Stack>
        {launching ? <LaunchSplash onDone={done} /> : null}
      </View>
    </SafeAreaProvider>
  );
}
