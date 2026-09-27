// task/[id].tsx: Task Details — exactly what to do before opening the camera: purpose, approximate
// area, a "what to capture" checklist, a privacy warning where people may appear, and one action.

import { useLocalSearchParams, useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { Icon } from "../../src/components/icons/Icon";
import { BackLink, Notice, PrimaryButton, Screen, SectionLabel } from "../../src/components/ui";
import { categoryAccent, getTask } from "../../src/tasks";
import { color, radius, space, type } from "../../src/theme";

export default function TaskDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const task = getTask(id ?? "");

  return (
    <Screen
      footer={<PrimaryButton label="Start report" onPress={() => router.push({ pathname: "/report/intro", params: { id: task.id } })} />}
    >
      <BackLink label="Tasks" onPress={() => router.back()} />

      <View style={styles.tag}>
        <View style={[styles.dot, { backgroundColor: color[categoryAccent[task.category]] }]} />
        <Text style={styles.tagText}>{task.category}</Text>
      </View>
      <Text style={styles.title} accessibilityRole="header">
        {task.title}
      </Text>

      <View style={styles.metaRow}>
        <Icon name="location" size={16} color={color.faint} />
        <Text style={styles.meta}>{task.area}</Text>
        <Icon name="clock" size={16} color={color.faint} />
        <Text style={styles.meta}>About {task.minutes} min</Text>
      </View>

      <Text style={styles.purpose}>{task.purpose}</Text>

      {task.peopleRisk ? (
        <Notice tone="attention" icon="privacy">
          Protect people's privacy. Avoid faces, names, identity documents, and private records.
        </Notice>
      ) : null}

      <View style={{ gap: space.sm }}>
        <SectionLabel>What to capture</SectionLabel>
        {task.photos.map((p, i) => (
          <View key={i} style={styles.checkItem}>
            <View style={styles.num}>
              <Text style={styles.numText}>{i + 1}</Text>
            </View>
            <Text style={styles.checkText}>{p.prompt}</Text>
          </View>
        ))}
        {task.questions.length > 0 ? (
          <View style={styles.checkItem}>
            <View style={styles.num}>
              <Icon name="questions" size={14} color={color.muted} />
            </View>
            <Text style={styles.checkText}>
              {task.questions.length} short {task.questions.length === 1 ? "question" : "questions"}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.offline}>
        <Icon name="offline" size={16} color={color.success} />
        <Text style={styles.offlineText}>You can finish this report without signal.</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  tag: { flexDirection: "row", alignItems: "center", gap: space.xs },
  dot: { width: 8, height: 8, borderRadius: radius.pill },
  tagText: { ...type.meta, color: color.muted, fontWeight: "700" },
  title: { ...type.display, color: color.text },
  metaRow: { flexDirection: "row", alignItems: "center", gap: space.xs, flexWrap: "wrap" },
  meta: { ...type.meta, color: color.muted, marginRight: space.sm },
  purpose: { ...type.body, color: color.text },
  checkItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
  },
  num: {
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    backgroundColor: color.surfaceSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  numText: { ...type.meta, color: color.muted, fontWeight: "700" },
  checkText: { ...type.body, color: color.text, flex: 1 },
  offline: { flexDirection: "row", alignItems: "center", gap: space.sm },
  offlineText: { ...type.meta, color: color.success, fontWeight: "600" },
});
