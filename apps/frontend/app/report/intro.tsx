// report/intro.tsx: reduce uncertainty before the first capture. Step count,
// estimate, offline note, short privacy reminder, one primary action. Starts a
// fresh draft for this task — unless a recent unfinished draft for the SAME task
// is already saved on the phone, in which case it offers continue / start over.
// Presentation over src/report-draft + src/tasks.

import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Icon } from "../../src/components/icons/Icon";
import {
  BackLink,
  Card,
  PrimaryButton,
  Reassurance,
  Screen,
  SecondaryButton,
  SectionLabel,
} from "../../src/components/ui";
import {
  clearDraft,
  clearPersistedDraft,
  hasPersistedDraft,
  isResumable,
  restoreDraft,
  resumeTarget,
  startDraft,
} from "../../src/report-draft";
import { getTask } from "../../src/tasks";
import { color, radius, space, type } from "../../src/theme";

export default function ReportIntroScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const task = getTask(id ?? "");

  const [ready, setReady] = useState(false);
  const [resume, setResume] = useState<{ photos: number; answers: number } | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const meta = await hasPersistedDraft();
      if (!alive) return;
      if (meta && meta.taskId === task.id && isResumable(meta)) {
        setResume({ photos: meta.photos, answers: meta.answers });
      } else {
        if (meta && meta.taskId !== task.id) await clearPersistedDraft();
        startDraft(task.id);
      }
      setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, [task.id]);

  const begin = () =>
    router.replace({ pathname: "/report/permissions", params: { id: task.id } });

  const continueReport = async () => {
    const draft = await restoreDraft();
    if (!draft) {
      startDraft(task.id);
      begin();
      return;
    }
    const target = resumeTarget(draft, task);
    router.replace({ pathname: target.pathname, params: target.params });
  };

  const startOver = async () => {
    clearDraft();
    await clearPersistedDraft();
    startDraft(task.id);
    setResume(null);
  };

  if (!ready) {
    return (
      <Screen>
        <BackLink label="Back" onPress={() => router.back()} />
        <Text style={styles.loading}>Getting things ready...</Text>
      </Screen>
    );
  }

  if (resume) {
    const parts: string[] = [];
    if (resume.photos > 0) parts.push(`${resume.photos} ${resume.photos === 1 ? "photo" : "photos"}`);
    if (resume.answers > 0)
      parts.push(`${resume.answers} ${resume.answers === 1 ? "answer" : "answers"}`);
    return (
      <Screen
        footer={
          <>
            <PrimaryButton label="Continue report" onPress={continueReport} />
            <SecondaryButton label="Start over" icon="retry" onPress={startOver} />
          </>
        }
      >
        <BackLink label="Back" onPress={() => router.back()} />
        <SectionLabel>Unfinished report</SectionLabel>
        <Text style={styles.title} accessibilityRole="header">
          {task.title}
        </Text>
        <Card>
          <View style={styles.resumeRow}>
            <Icon name="offline" size={20} color={color.primary} />
            <Text style={styles.resumeText}>
              You started this report earlier and it is still saved on this phone
              {parts.length ? ` — ${parts.join(" and ")} so far` : ""}. You can pick up where you
              left off, or start again.
            </Text>
          </View>
        </Card>
        <Reassurance
          title="Nothing was sent"
          body="An unfinished report stays on this phone only. Starting over deletes it from the phone."
        />
      </Screen>
    );
  }

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
  loading: { ...type.body, color: color.muted },
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
  resumeRow: { flexDirection: "row", gap: space.sm, alignItems: "flex-start" },
  resumeText: { ...type.body, color: color.text, flex: 1 },
});
