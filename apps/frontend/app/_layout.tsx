// _layout.tsx: root navigation stack for the Expo Router app.
// Header styling comes from src/theme.ts tokens; no raw colors here.
// NOTE: if worker/crypto-polyfill lands, its `import "react-native-get-random-values";`
// must stay the FIRST statement of this file, above these imports.

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
