// report/review.tsx: the evidence sheet (Alternative C, screen 2) — item header, the approximate area
// on a map, numbered evidence photos (tap one to retake it), the answers, an optional private note and
// one "Save report" action. Saving turns the draft into signed queued proofs via report-draft.saveDraft.

import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { CellMap } from "../../src/components/CellMap";
import { Icon } from "../../src/components/icons/Icon";
import {
  AnswerChip,
  BackLink,
  EvidenceSteps,
  Notice,
  PrimaryButton,
  ReportProgress,
  Screen,
  TaskHeader,
} from "../../src/components/ui";
import { captureProof } from "../../src/capture";
import { bump, warn } from "../../src/feedback";
import { identityStepEnabled } from "../../src/flags";
import { getDraft, saveDraft, setCaptureProof, setNote } from "../../src/report-draft";
import { NOTE_MAX, noteCounter } from "../../src/report-note";
import { getTask } from "../../src/tasks";
import { color, radius, space, target, type } from "../../src/theme";

// Wire the real (native keystore + sqlite) capture path into the draft module here,
// where the native graph is already loaded. report-draft.ts stays free of it so the
// off-device unit tests can import it. Static import -> bundled, no offline chunk fetch.
setCaptureProof(captureProof);

export default function ReportReviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const task = getTask(id ?? "");
  const draft = getDraft();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNoteText] = useState(draft?.note ?? "");
  // Questions and Capture pop back to this same Review after an edit; re-read the draft then.
  const [, refresh] = useState(0);
  useFocusEffect(useCallback(() => refresh((n) => n + 1), []));

  const photos = draft?.photos ?? [];
  const answers = draft?.answers ?? {};
  const answered = task.questions.filter((q) => answers[q.id]);
  const counter = noteCounter(note);

  const finish = async () => {
    void bump();
    setNote(note);
    setBusy(true);
    setError(null);
    const result = await saveDraft();
    setBusy(false);
    if (result.saved === 0) {
      void warn();
      setError("The report could not be saved on this phone. Please try again.");
      return;
    }
    router.replace({
      pathname: "/report/saved",
      params: { id: task.id, hash: result.firstProofHash ?? "", count: String(result.saved) },
    });
  };

  const retake = (step: number) =>
    router.push({ pathname: "/report/capture", params: { id: task.id, step: String(step), retake: "1" } });

  return (
    <Screen footer={<PrimaryButton label="Save report" onPress={finish} busy={busy} />}>
      <BackLink label="Back" onPress={() => router.back()} />
      <ReportProgress
        step={identityStepEnabled() ? 4 : 3}
        total={identityStepEnabled() ? 4 : 3}
        label="Review"
      />

      <TaskHeader category={task.category} title={task.title} subtitle={task.purpose} />

      {draft?.geohash ? (
        <CellMap
          cells={[{ key: "report", cell: draft.geohash.slice(0, 5), tone: "self" }]}
          focusCell={draft.geohash.slice(0, 5)}
          height={170}
          caption="Showing an approximate area (not exact location)"
          offlineLabel={`${draft.areaLabel || "Approximate area"}. Only the approximate area is part of the report.`}
        />
      ) : (
        <Notice tone="warning" icon="location">
          No area added yet.
        </Notice>
      )}

      <View style={{ gap: space.xs }}>
        <Text style={styles.section}>
          Add evidence <Text style={styles.sectionMeta}>({task.photos.length} {task.photos.length === 1 ? "step" : "steps"})</Text>
        </Text>
        <Text style={styles.sub}>Tap a photo to take it again.</Text>
      </View>
      <EvidenceSteps
        prompts={task.photos.map((p) => p.prompt)}
        photos={task.photos.map((_, i) => photos.find((p) => p.stepIndex === i)?.uri)}
        onPress={retake}
      />

      {answered.length > 0 ? (
        <View style={{ gap: space.sm }}>
          <Text style={styles.section}>Current condition</Text>
          {answered.map((q) => (
            <Pressable
              key={q.id}
              onPress={() =>
                router.push({
                  pathname: "/report/questions",
                  params: { id: task.id, q: String(task.questions.indexOf(q)), from: "review" },
                })
              }
              accessibilityRole="button"
              accessibilityLabel={`${q.text} ${answers[q.id]}. Tap to change.`}
              style={({ pressed }) => [styles.answer, pressed && styles.pressed]}
            >
              <Text style={styles.answerQ}>{q.text}</Text>
              <View style={styles.answerRow}>
                <AnswerChip option={answers[q.id] ?? ""} />
                <Text style={styles.change}>Change</Text>
              </View>
            </Pressable>
          ))}
        </View>
      ) : null}

      <View style={{ gap: space.sm }}>
        <Text style={styles.section}>
          Add a note <Text style={styles.sectionMeta}>(optional)</Text>
        </Text>
        <TextInput
          value={note}
          onChangeText={setNoteText}
          onEndEditing={() => setNote(note)}
          maxLength={NOTE_MAX}
          multiline
          returnKeyType="done"
          submitBehavior="blurAndSubmit"
          placeholder="Share any extra details (no names, please)..."
          placeholderTextColor={color.muted}
          style={styles.note}
          accessibilityLabel="Add a note, optional"
          accessibilityHint="Do not include names, phone numbers, ID numbers or exact addresses"
        />
        <View style={styles.noteHelp}>
          <Icon name="info" size={14} color={color.muted} />
          <Text style={styles.noteHelpText}>
            Do not include names, phone numbers, ID numbers or exact addresses. Your note stays on
            this phone.
          </Text>
          {counter ? <Text style={styles.counter}>{counter}</Text> : null}
        </View>
      </View>

      {error ? <Notice tone="attention" icon="warning">{error}</Notice> : null}

      <View style={styles.privacy}>
        <Icon name="privacy" size={18} color={color.success} />
        <Text style={styles.privacyText}>Your identity and exact location are not included in the report.</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.7 },
  sub: { ...type.meta, color: color.muted },
  section: { ...type.subtitle, color: color.text },
  sectionMeta: { ...type.body, color: color.muted, fontWeight: "400" },
  answer: {
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
  },
  answerQ: { ...type.meta, color: color.muted },
  answerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  change: { ...type.meta, color: color.primary, fontWeight: "700" },
  note: {
    ...type.body,
    minHeight: 88,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface,
    color: color.text,
    textAlignVertical: "top",
  },
  noteHelp: { flexDirection: "row", alignItems: "flex-start", gap: space.xs },
  noteHelpText: { ...type.meta, color: color.muted, flex: 1 },
  counter: { ...type.meta, color: color.text, fontWeight: "700" },
  privacy: { flexDirection: "row", alignItems: "center", gap: space.sm },
  privacyText: { ...type.meta, color: color.text, fontWeight: "600", flex: 1 },
});
