// _layout.tsx: root navigation stack for the Expo Router app.

import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

export default function RootLayout() {
  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: true }}>
        <Stack.Screen name="index" options={{ title: "Proof-at-Capture" }} />
        <Stack.Screen name="capture" options={{ title: "Capture evidence" }} />
      </Stack>
    </>
  );
}
