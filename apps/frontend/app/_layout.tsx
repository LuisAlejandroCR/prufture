import "react-native-get-random-values";
// _layout.tsx: root navigation stack for the Expo Router app.
// The crypto shim above is a side-effect import and MUST stay the first statement:
// it binds globalThis.crypto.getRandomValues before @proof/core (ed25519 via
// @noble/curves) is first touched by the keystore on launch.
// The bottom tab bar lives in app/(tabs)/_layout.tsx; the guided report flow and
// the detail screens are plain stack screens with in-screen back controls.

import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { color } from "../src/theme";
import { API_URL, useAutoSync } from "../src/useAutoSync";
import { notifyReportConfirmed, registerForPush } from "../src/notifications";

export default function RootLayout() {
  // Anonymous push registration: no permission -> the app is unchanged, just no push.
  useEffect(() => {
    void registerForPush(API_URL);
  }, []);

  // Drain the offline queue when coverage returns or the app is foregrounded.
  // When a sync confirms a report, fire the local "confirmed" notification as a
  // fallback for when no server push is delivered.
  useAutoSync((summary) => {
    if (summary.attested > 0) void notifyReportConfirmed(summary.attested);
  });

  return (
    <SafeAreaProvider>
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
    </SafeAreaProvider>
  );
}
