// about.tsx: the app version, and nothing else. Operational guidance lives in Help; data handling
// lives in Data and privacy.

import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { BackLink, Screen, ScreenTitle } from "../src/components/ui";
import { color, radius, space, type } from "../src/theme";

export default function AboutScreen() {
  const router = useRouter();
  const version = Constants.expoConfig?.version ?? "development";
  return (
    <Screen>
      <BackLink label="Me" onPress={() => router.back()} />
      <ScreenTitle>About Prufture</ScreenTitle>
      <View style={styles.meta} accessible accessibilityLabel={`Version ${version}`}>
        <Text style={styles.metaLabel}>Version</Text>
        <Text style={styles.metaValue}>{version}</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  meta: { gap: space.xs, padding: space.md, borderRadius: radius.md, backgroundColor: color.surfaceSoft },
  metaLabel: { ...type.meta, color: color.muted, fontWeight: "700" },
  metaValue: { ...type.body, color: color.text },
});
