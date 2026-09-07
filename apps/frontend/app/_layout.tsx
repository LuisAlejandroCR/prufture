import "react-native-get-random-values";
// _layout.tsx: root navigation stack for the Expo Router app.
// Header styling comes from src/theme.ts tokens; no raw colors here.
// The crypto shim above is a side-effect import and MUST stay the first
// statement: it binds globalThis.crypto.getRandomValues before @proof/core
// (ed25519 via @noble/curves) is first touched by the keystore on launch.

import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { color, type } from "../src/theme";
import { useAutoSync } from "../src/useAutoSync";

export default function RootLayout() {
  // Drain the offline queue when coverage returns or the app is foregrounded.
  useAutoSync();

  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: true,
          headerStyle: { backgroundColor: color.bg },
          headerTintColor: color.text,
          headerTitleStyle: { fontSize: type.title.fontSize, fontWeight: type.title.fontWeight },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: color.bg },
        }}
      >
        <Stack.Screen name="index" options={{ title: "Prufture" }} />
        <Stack.Screen name="capture" options={{ title: "Capture evidence" }} />
      </Stack>
    </>
  );
}
