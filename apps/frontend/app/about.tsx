// about.tsx: compact product purpose and public-project context for the reporter app.
// Operational guidance remains in Help; data handling remains in Data and privacy.

import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { Illustration } from "../src/components/Illustration";
import { BackLink, Screen, ScreenTitle } from "../src/components/ui";
import { color, radius, space, type } from "../src/theme";

export default function AboutScreen() {
  const router = useRouter();
  const version = Constants.expoConfig?.version ?? "development";
  return (
    <Screen>
      <BackLink label="Me" onPress={() => router.back()} />
      <ScreenTitle>About Prufture</ScreenTitle>
      <View style={styles.hero}>
        <Illustration scene="growth" height={120} />
        <View style={styles.copy}>
          <Text style={styles.title}>Community evidence, built for weak connectivity</Text>
          <Text style={styles.body}>Prufture helps people document programme activities with guided evidence that can be saved offline and checked later.</Text>
        </View>
      </View>
      <View style={styles.meta}>
        <Text style={styles.metaLabel}>Version</Text>
        <Text style={styles.metaValue}>{version}</Text>
        <Text style={styles.metaLabel}>Project</Text>
        <Text style={styles.metaValue}>UNICEF FIRSTBLOCK-ATHON open-source prototype</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { overflow: "hidden", borderRadius: radius.md, backgroundColor: color.surface, borderWidth: 1, borderColor: color.border },
  copy: { gap: space.sm, padding: space.md },
  title: { ...type.title, color: color.text },
  body: { ...type.body, color: color.muted },
  meta: { gap: space.xs, padding: space.md, borderRadius: radius.md, backgroundColor: color.surfaceSoft },
  metaLabel: { ...type.meta, color: color.muted, fontWeight: "700", marginTop: space.xs },
  metaValue: { ...type.body, color: color.text },
});
