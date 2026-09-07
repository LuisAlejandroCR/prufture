// _layout.tsx: root navigation stack for the Expo Router app.
// Header styling comes from src/theme.ts tokens; no raw colors here.

import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { color, type } from "../src/theme";

export default function RootLayout() {
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
