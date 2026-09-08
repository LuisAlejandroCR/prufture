// report/intro.tsx: reduce uncertainty before the first capture. Step count,
// estimate, offline note, short privacy reminder, one primary action. Starts a
// fresh draft for this task. Presentation over src/report-draft + src/tasks.

import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Icon } from "../../src/components/icons/Icon";
import { BackLink, PrimaryButton, Reassurance, Screen, SectionLabel } from "../../src/components/ui";
import { startDraft } from "../../src/report-draft";
import { getTask } from "../../src/tasks";
import { color, radius, space, type } from "../../src/theme";

export default function ReportIntroScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const task = getTask(id ?? "");

  useEffect(() => {
    startDraft(task.id);
  }, [task.id]);

  const begin = () =>
    router.replace({ pathname: "/report/permissions", params: { id: task.id } });

  return (
    <Screen footer={<PrimaryButton label="Begin" onPress={begin} />}>
      <BackLink label="Back" onPress={() => router.back()} />
      <SectionLabel>Before you start</SectionLabel>
      <Text style={styles.title} accessibilityRole="header">
        {task.title}
      </Text>

      <View style={styles.facts}>
        <Fact icon="review" text={`${task.photos.length} photos, then ${task.questions.length} short ${task.questions.length === 1 ? "question" : "questions"}`} />
        <Fact icon="clock" text={`About ${task.minutes} minutes`} />
        <Fact icon="offline" text="You can finish without signal" tint={color.success} />
      </View>

      <Reassurance
        title="Only what is needed"
        body="Photos of the work and a couple of answers. No name, no exact location, no personal details."
      />
    </Screen>
  );
}

function Fact({ icon, text, tint }: { icon: "review" | "clock" | "offline"; text: string; tint?: string }) {
  return (
    <View style={styles.fact}>
      <View style={styles.factIcon}>
        <Icon name={icon} size={18} color={tint ?? color.muted} />
      </View>
      <Text style={styles.factText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { ...type.display, color: color.text },
  facts: { gap: space.sm },
  fact: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
  },
  factIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    backgroundColor: color.surfaceSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  factText: { ...type.body, color: color.text, flex: 1 },
});
