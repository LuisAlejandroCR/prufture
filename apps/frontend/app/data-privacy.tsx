// data-privacy.tsx: a plain-language inventory of what a report keeps, shares, and leaves on-device.
// This is separate from task help so privacy promises are easy to find and do not get repeated.

import { useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { Icon, type IconName } from "../src/components/icons/Icon";
import { BackLink, Notice, Screen, ScreenTitle } from "../src/components/ui";
import { color, radius, space, type } from "../src/theme";

const ITEMS: { icon: IconName; title: string; detail: string }[] = [
  { icon: "photo", title: "Photos stay on this phone", detail: "The original photo is not uploaded unless you explicitly choose to share it." },
  { icon: "location", title: "Only an approximate area", detail: "Reports use a shortened location cell. Your exact position is not included in the public report." },
  { icon: "privacy", title: "No identity in reports", detail: "Your name, phone number, identity documents, and account details are not part of a report." },
  { icon: "offline", title: "Saved locally when offline", detail: "Unsent reports wait on this phone and retry when a connection returns." },
];

export default function DataPrivacyScreen() {
  const router = useRouter();
  return (
    <Screen>
      <BackLink label="Me" onPress={() => router.back()} />
      <ScreenTitle hint="A clear summary of the data used by a report.">Data and privacy</ScreenTitle>
      <Notice tone="info" icon="shield">Public reports contain a proof reference, task, approximate area, and capture time — not your identity.</Notice>
      <View style={styles.list}>
        {ITEMS.map((item) => (
          <View key={item.title} style={styles.item}>
            <View style={styles.icon}><Icon name={item.icon} size={20} color={color.primary} /></View>
            <View style={styles.copy}>
              <Text style={styles.title}>{item.title}</Text>
              <Text style={styles.detail}>{item.detail}</Text>
            </View>
          </View>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { gap: space.sm },
  item: { flexDirection: "row", gap: space.md, padding: space.md, borderRadius: radius.md, backgroundColor: color.surface, borderWidth: 1, borderColor: color.border },
  icon: { width: 40, height: 40, borderRadius: radius.sm, backgroundColor: color.primarySoft, alignItems: "center", justifyContent: "center" },
  copy: { flex: 1, gap: space.xs },
  title: { ...type.subtitle, color: color.text },
  detail: { ...type.body, color: color.muted },
});
