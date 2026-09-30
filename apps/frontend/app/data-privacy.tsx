// data-privacy.tsx: a plain-language inventory of what a report keeps, shares, and leaves on-device,
// plus the programme pass when this build has it on. Separate from task help so privacy promises are
// easy to find and do not get repeated.

import { useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { Icon, type IconName } from "../src/components/icons/Icon";
import { BackLink, Notice, Screen, ScreenTitle } from "../src/components/ui";
import { personhoodProvider } from "../src/flags";
import { color, radius, space, type } from "../src/theme";

const ITEMS: { icon: IconName; title: string; detail: string }[] = [
  { icon: "photo", title: "Photos stay on this phone", detail: "The original photo is not uploaded unless you explicitly choose to share it for a report, or say yes when the programme team asks. A shared photo is locked on this phone so only the programme team can open it, deleted after 90 days, and never shown on the public page." },
  { icon: "location", title: "Only an approximate area is public", detail: "Reports use a shortened location cell. Your exact position is not included in the public report." },
  { icon: "shield", title: "Precise point, encrypted", detail: "When the programme has set up audits, your precise location is encrypted on this phone so only the programme team can open it. It is never shown publicly." },
  { icon: "privacy", title: "No identity in reports", detail: "Your name, phone number, identity documents, and account details are not part of a report." },
  { icon: "offline", title: "Saved locally when offline", detail: "Unsent reports wait on this phone and retry when a connection returns." },
];

const PASS_ITEM = {
  icon: "programme" as IconName,
  title: "Programme pass",
  detail: "Your pass code is made and kept on this phone. You show it to your coordinator once, in person. The check sent with each report says only that it came from someone on the programme list; it does not send the code, your name, phone number or location. When the check passes, the report is marked as coming from an enrolled programme member.",
};

export default function DataPrivacyScreen() {
  const router = useRouter();
  const items = personhoodProvider() === "semaphore" ? [...ITEMS, PASS_ITEM] : ITEMS;
  return (
    <Screen>
      <BackLink label="Me" onPress={() => router.back()} />
      <ScreenTitle hint="A clear summary of the data used by a report.">Data and privacy</ScreenTitle>
      <Notice tone="info" icon="shield">Public reports contain a proof reference, task, approximate area, and capture time. Never your identity.</Notice>
      <View style={styles.list}>
        {items.map((item) => (
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
