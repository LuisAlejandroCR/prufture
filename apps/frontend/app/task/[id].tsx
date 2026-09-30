// task/[id].tsx: Task details in the Alternative C evidence style — category header, the approximate
// area on a map, the numbered evidence to capture, the questions that follow (offline is one meta fact;
// the people-privacy reminder lives on the camera, where the photo is framed),
// and one "Start report" action. A reporter near an assignment is told their report counts as a community
// confirmation (src/confirmations.ts). Nothing is captured here.

import { useLocalSearchParams, useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { CellMap } from "../../src/components/CellMap";
import { Icon } from "../../src/components/icons/Icon";
import { BackLink, EvidenceSteps, InfoCard, Notice, PrimaryButton, Screen, TaskHeader } from "../../src/components/ui";
import { confirmationInvite } from "../../src/confirmations";
import { communityProgress } from "../../src/progress";
import { distanceLabel, getTask } from "../../src/tasks";
import { color, radius, space, type } from "../../src/theme";
import { useApproxArea } from "../../src/useApproxArea";

export default function TaskDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const task = getTask(id ?? "");
  const { cell } = useApproxArea();
  const distance = distanceLabel(cell, task);
  const progress = communityProgress(task);
  const invite = confirmationInvite(task, cell);

  return (
    <Screen
      footer={
        <PrimaryButton label="Start report" onPress={() => router.push({ pathname: "/report/intro", params: { id: task.id } })} />
      }
    >
      <BackLink label="Missions" onPress={() => router.back()} />
      <TaskHeader category={task.category} title={task.title} subtitle={task.purpose} />

      <View style={styles.meta}>
        <Icon name="location" size={15} color={color.muted} />
        <Text style={styles.metaText}>{distance ? `${task.area} · ${distance}` : task.area}</Text>
        <Icon name="clock" size={15} color={color.muted} />
        <Text style={styles.metaText}>About {task.minutes} min</Text>
        <Icon name="offline" size={15} color={color.muted} />
        <Text style={styles.metaText}>Works offline</Text>
      </View>

      {task.cell ? (
        <CellMap
          cells={[
            ...(cell ? [{ key: "me", cell, tone: "self" as const }] : []),
            { key: task.id, cell: task.cell, tone: "task" as const },
          ]}
          height={170}
          focusCell={task.cell}
          caption="Showing an approximate area (not exact location)"
          offlineLabel={`${task.area}. Map available when online.`}
        />
      ) : null}

      <View style={{ gap: space.xs }}>
        <Text style={styles.section}>
          Add evidence{" "}
          <Text style={styles.sectionMeta}>
            ({task.photos.length} {task.photos.length === 1 ? "step" : "steps"})
          </Text>
        </Text>
        <Text style={styles.sub}>Take a few clear photos to show the situation.</Text>
      </View>
      <EvidenceSteps prompts={task.photos.map((p) => p.prompt)} />

      {task.questions.length > 0 ? (
        <View style={{ gap: space.sm }}>
          <Text style={styles.section}>Then answer</Text>
          {task.questions.map((q) => (
            <View key={q.id} style={styles.question}>
              <Icon name="questions" size={16} color={color.muted} />
              <Text style={styles.questionText}>{q.text}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {progress ? (
        <InfoCard
          icon="community"
          tint={color.success}
          soft={color.successSoft}
          title={`${progress.have} of ${progress.need} confirmations`}
          body={invite ?? "More confirmations help build a clearer picture for the community."}
        />
      ) : null}

    </Screen>
  );
}

const styles = StyleSheet.create({
  meta: { flexDirection: "row", alignItems: "center", gap: space.xs, flexWrap: "wrap" },
  metaText: { ...type.meta, color: color.muted, marginRight: space.sm },
  section: { ...type.subtitle, color: color.text },
  sectionMeta: { ...type.body, color: color.muted, fontWeight: "400" },
  sub: { ...type.meta, color: color.muted },
  question: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
  },
  questionText: { ...type.body, color: color.text, flex: 1 },
});
