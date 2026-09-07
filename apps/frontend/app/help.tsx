// help.tsx: compact icon-and-row help index. Each row is a soft tinted icon, a
// short title, a one-line explanation, and a chevron. Details expand in place on
// selection instead of stacking long FAQ cards. No crypto vocabulary.

import { useRouter } from "expo-router";
import { useState } from "react";
import { LayoutAnimation, Pressable, StyleSheet, Text, View } from "react-native";
import { Icon, type IconName } from "../src/components/icons/Icon";
import { BackLink, Screen, ScreenTitle } from "../src/components/ui";
import { color, radius, space, target, type } from "../src/theme";

interface Topic {
  icon: IconName;
  title: string;
  line: string;
  detail: string;
}

const TOPICS: Topic[] = [
  {
    icon: "report",
    title: "How to make a report",
    line: "Pick a task, take the photos, answer a few questions.",
    detail:
      "Open a task from Home or Tasks, follow the steps in order, confirm the area, then review and finish. Each step is short and you can go back.",
  },
  {
    icon: "photo",
    title: "Taking safe photos",
    line: "Show the work, not the people.",
    detail:
      "Avoid faces, names, identity documents, and private records. Frame the equipment, the building, or the result. If a person is in the way, wait or change your angle.",
  },
  {
    icon: "offline",
    title: "Using the app without signal",
    line: "Everything works offline.",
    detail:
      "You can browse tasks, capture photos, answer questions, and finish a report with no connection. The report is saved on your phone and sends itself when you have signal again.",
  },
  {
    icon: "location",
    title: "Why approximate location is used",
    line: "We keep only a rough area, never your exact spot.",
    detail:
      "A report carries an approximate area so the programme team knows the region. Your exact position is never stored or shared.",
  },
  {
    icon: "check",
    title: "What happens after I send",
    line: "The programme team reviews it, and other reports can confirm it.",
    detail:
      "After a report is sent it is reviewed by the programme team. When another community member reports the same activity, it is marked confirmed.",
  },
  {
    icon: "privacy",
    title: "My privacy",
    line: "Your name and identity are never in a report.",
    detail:
      "Reports never include your name, phone number, or any identity document. The original photo stays on your phone unless you choose to share it.",
  },
  {
    icon: "warning",
    title: "Report a problem",
    line: "Something looks wrong or a report will not send.",
    detail:
      "If a report shows Needs your attention, open it and use Try again. If that does not help, contact your programme focal point.",
  },
];

export default function HelpScreen() {
  const router = useRouter();
  const [open, setOpen] = useState<number | null>(null);

  const toggle = (i: number) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen((cur) => (cur === i ? null : i));
  };

  return (
    <Screen>
      <BackLink label="Back" onPress={() => router.back()} />
      <ScreenTitle>Help</ScreenTitle>

      <View style={{ gap: space.sm }}>
        {TOPICS.map((t, i) => {
          const expanded = open === i;
          return (
            <View key={t.title} style={styles.item}>
              <Pressable
                onPress={() => toggle(i)}
                accessibilityRole="button"
                accessibilityState={{ expanded }}
                accessibilityLabel={t.title}
                accessibilityHint={t.line}
                style={({ pressed }) => [styles.rowInner, pressed && styles.pressed]}
              >
                <View style={styles.iconWrap}>
                  <Icon name={t.icon} size={20} color={color.primary} />
                </View>
                <View style={styles.flex}>
                  <Text style={styles.title}>{t.title}</Text>
                  <Text style={styles.line}>{t.line}</Text>
                </View>
                <Icon name={expanded ? "back" : "chevron"} size={16} color={color.faint} />
              </Pressable>
              {expanded ? <Text style={styles.detail}>{t.detail}</Text> : null}
            </View>
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  item: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface,
    overflow: "hidden",
  },
  rowInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    padding: space.md,
    minHeight: target.min + 8,
  },
  pressed: { opacity: 0.7 },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: color.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { ...type.subtitle, color: color.text },
  line: { ...type.meta, color: color.muted },
  detail: {
    ...type.body,
    color: color.muted,
    paddingHorizontal: space.md,
    paddingBottom: space.md,
  },
});
