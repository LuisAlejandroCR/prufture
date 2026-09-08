// (tabs)/index.tsx: Home. One glance, one next task, one primary action.
// Shows the offline queue notice only when reports are waiting. No statistics,
// no activity feed, no technical status. Presentation over src/queue + src/tasks.

import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { QueuedProof } from "@proof/core";
import { Icon } from "../../src/components/icons/Icon";
import {
  Card,
  PrimaryButton,
  Reassurance,
  Screen,
  SectionLabel,
} from "../../src/components/ui";
import { listProofs } from "../../src/queue";
import { runPendingSync } from "../../src/useAutoSync";
import { categoryAccent, recommendedTask } from "../../src/tasks";
import { color, radius, space, type } from "../../src/theme";

export default function HomeScreen() {
  const router = useRouter();
  const [pending, setPending] = useState(0);
  const [reachError, setReachError] = useState(false);
  const task = recommendedTask();

  useFocusEffect(
    useCallback(() => {
      listProofs()
        .then((rows: QueuedProof[]) => {
          const waiting = rows.filter((r) => r.status === "pending_sync").length;
          setPending(waiting);
          if (waiting > 0) {
            runPendingSync()
              .then((s) => {
                setReachError(s.failed > 0 && s.synced === 0);
                listProofs()
                  .then((r2) => setPending(r2.filter((r) => r.status === "pending_sync").length))
                  .catch(() => undefined);
              })
              .catch(() => undefined);
          }
        })
        .catch(() => setPending(0));
    }, []),
  );

  const start = () => router.push({ pathname: "/report/intro", params: { id: task.id } });

  return (
    <Screen
      footer={
        <>
          <PrimaryButton label="Start report" onPress={start} />
          <Text style={styles.footNote}>Your report stays private. We only ask for what is needed to confirm this activity.</Text>
        </>
      }
    >
      <View style={styles.head}>
        <View>
          <Text style={styles.hello}>Hello</Text>
          <Text style={styles.sub}>Ready when you are.</Text>
        </View>
        <Pressable
          onPress={() => router.push("/me")}
          accessibilityRole="button"
          accessibilityLabel="Open your profile"
          style={styles.avatar}
        >
          <Icon name="profile" size={22} color={color.muted} />
        </Pressable>
      </View>

      {reachError ? (
        <View style={styles.reachError}>
          <Icon name="offline" size={16} color={color.warning} />
          <Text style={styles.reachErrorText}>Could not reach the server — will retry.</Text>
        </View>
      ) : null}

      {pending > 0 ? (
        <Pressable
          onPress={() => router.push("/updates")}
          accessibilityRole="button"
          accessibilityLabel={`${pending} ${pending === 1 ? "report" : "reports"} waiting to send. Open updates.`}
          style={styles.queue}
        >
          <Icon name="offline" size={20} color={color.warning} />
          <Text style={styles.queueText}>
            {pending} {pending === 1 ? "report is" : "reports are"} waiting to send. They go out
            automatically when you have signal.
          </Text>
          <Icon name="chevron" size={16} color={color.warning} />
        </Pressable>
      ) : null}

      <View style={{ gap: space.sm }}>
        <SectionLabel>Your next task</SectionLabel>
        <Card onPress={start} accessibilityLabel={`${task.category}. ${task.title}. ${task.area}. Start report.`}>
          <View style={styles.tag}>
            <View style={[styles.dot, { backgroundColor: color[categoryAccent[task.category]] }]} />
            <Text style={styles.tagText}>{task.category}</Text>
          </View>
          <Text style={styles.taskTitle}>{task.title}</Text>
          <View style={styles.metaRow}>
            <Icon name="location" size={15} color={color.faint} />
            <Text style={styles.meta}>{task.area}</Text>
          </View>
          <Text style={styles.need}>
            Take {task.photos.length} photos and answer {task.questions.length}{" "}
            {task.questions.length === 1 ? "short question" : "short questions"}.
          </Text>
          {task.progressLabel ? (
            <View style={styles.progress}>
              <Text style={styles.progressText}>{task.progressLabel}</Text>
            </View>
          ) : null}
        </Card>
      </View>

      <Reassurance
        title="Your report stays private"
        body="No photo, name, or exact location leaves this phone with the report."
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  hello: { ...type.display, color: color.text },
  sub: { ...type.body, color: color.muted },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
    alignItems: "center",
    justifyContent: "center",
  },
  queue: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: color.warningSoft,
  },
  queueText: { ...type.meta, flex: 1, color: color.warning, fontWeight: "600" },
  reachError: { flexDirection: "row", alignItems: "center", gap: space.sm },
  reachErrorText: { ...type.meta, color: color.warning, fontWeight: "600", flex: 1 },
  tag: { flexDirection: "row", alignItems: "center", gap: space.xs },
  dot: { width: 8, height: 8, borderRadius: radius.pill },
  tagText: { ...type.meta, color: color.muted, fontWeight: "700" },
  taskTitle: { ...type.title, color: color.text },
  metaRow: { flexDirection: "row", alignItems: "center", gap: space.xs },
  meta: { ...type.meta, color: color.muted },
  need: { ...type.body, color: color.muted },
  progress: {
    alignSelf: "flex-start",
    backgroundColor: color.surfaceSoft,
    paddingVertical: space.xs,
    paddingHorizontal: space.sm,
    borderRadius: radius.sm,
  },
  progressText: { ...type.meta, color: color.muted, fontWeight: "600" },
  footNote: { ...type.meta, color: color.faint, textAlign: "center" },
});
