// report/review.tsx: catch mistakes before saving. Short summary, safe thumbnails,
// Finish report / Edit, and a plain privacy statement. Finish turns the draft into
// signed queued proofs through the existing capture path (src/report-draft.saveDraft).

import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { Icon } from "../../src/components/icons/Icon";
import {
  BackLink,
  Notice,
  PrimaryButton,
  ReportProgress,
  Screen,
  SecondaryButton,
  SectionLabel,
} from "../../src/components/ui";
import { bump } from "../../src/feedback";
import { getDraft, saveDraft } from "../../src/report-draft";
import { getTask } from "../../src/tasks";
import { color, radius, space, type } from "../../src/theme";

export default function ReportReviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const task = getTask(id ?? "");
  const draft = getDraft();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const photos = draft?.photos ?? [];
  const answers = draft?.answers ?? {};
  const answerCount = Object.keys(answers).length;

  const finish = async () => {
    void bump();
    setBusy(true);
    setError(null);
    const result = await saveDraft();
    setBusy(false);
    if (result.saved === 0) {
      setError("The report could not be saved on this phone. Please try again.");
      return;
    }
    router.replace({
      pathname: "/report/saved",
      params: { id: task.id, hash: result.firstProofHash ?? "", count: String(result.saved) },
    });
  };

  return (
    <Screen
      footer={
        <>
          <PrimaryButton label="Finish report" onPress={finish} busy={busy} />
          <SecondaryButton
            label="Edit"
            icon="retry"
            onPress={() => router.replace({ pathname: "/report/capture", params: { id: task.id, step: "0" } })}
          />
        </>
      }
    >
      <BackLink label="Back" onPress={() => router.back()} />
      <ReportProgress step={4} label="Review" />
      <Text style={styles.title} accessibilityRole="header">
        Review your report
      </Text>

      <View style={styles.summary}>
        <SummaryLine icon="photo" text={`${photos.length} ${photos.length === 1 ? "photo" : "photos"}`} />
        <SummaryLine icon="questions" text={`${answerCount} ${answerCount === 1 ? "answer" : "answers"}`} />
        <SummaryLine icon="location" text={draft?.geohash ? draft.areaLabel : "No area added"} />
        <SummaryLine icon="clock" text="Captured just now" />
      </View>

      {photos.length > 0 ? (
        <View style={{ gap: space.sm }}>
          <SectionLabel>Photos</SectionLabel>
          <View style={styles.thumbs}>
            {photos.map((p) => (
              <Image
                key={p.stepIndex}
                source={{ uri: p.uri }}
                style={styles.thumb}
                accessibilityLabel={task.photos[p.stepIndex]?.prompt ?? "Report photo"}
              />
            ))}
          </View>
        </View>
      ) : null}

      {answerCount > 0 ? (
        <View style={{ gap: space.sm }}>
          <SectionLabel>Answers</SectionLabel>
          {task.questions
            .filter((q) => answers[q.id])
            .map((q) => (
              <View key={q.id} style={styles.answerRow}>
                <Text style={styles.answerQ}>{q.text}</Text>
                <Text style={styles.answerA}>{answers[q.id]}</Text>
              </View>
            ))}
        </View>
      ) : null}

      {error ? <Notice tone="attention" icon="warning">{error}</Notice> : null}

      <View style={styles.privacy}>
        <Icon name="privacy" size={18} color={color.success} />
        <Text style={styles.privacyText}>
          Your identity and exact location are not included in the report.
        </Text>
      </View>
    </Screen>
  );
}

function SummaryLine({ icon, text }: { icon: "photo" | "questions" | "location" | "clock"; text: string }) {
  return (
    <View style={styles.sLine}>
      <Icon name={icon} size={18} color={color.muted} />
      <Text style={styles.sText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { ...type.display, color: color.text },
  summary: {
    gap: space.sm,
    padding: space.lg,
    borderRadius: radius.md,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
  },
  sLine: { flexDirection: "row", alignItems: "center", gap: space.md },
  sText: { ...type.body, color: color.text, flex: 1 },
  thumbs: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  thumb: { width: 88, height: 110, borderRadius: radius.sm, backgroundColor: color.surfaceSoft },
  answerRow: {
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
    gap: 2,
  },
  answerQ: { ...type.meta, color: color.muted },
  answerA: { ...type.subtitle, color: color.text },
  privacy: { flexDirection: "row", alignItems: "center", gap: space.sm },
  privacyText: { ...type.meta, color: color.success, fontWeight: "600", flex: 1 },
});
