// report/review.tsx: the evidence sheet (Alternative C, screen 2) — item header, the approximate area
// on a map, numbered evidence photos (tap one to retake it), the answers, an optional private note and
// one "Save report" action. Saving turns the draft into signed queued proofs via report-draft.saveDraft.

import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Image, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { CellMap } from "../../src/components/CellMap";
import { Icon } from "../../src/components/icons/Icon";
import {
  BackLink,
  CategoryBadge,
  Notice,
  PrimaryButton,
  ReportProgress,
  Screen,
} from "../../src/components/ui";
import { captureProof } from "../../src/capture";
import { bump } from "../../src/feedback";
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

      <View style={styles.header}>
        <CategoryBadge category={task.category} size={52} />
        <View style={styles.flex}>
          <Text style={styles.title} accessibilityRole="header">
            {task.title}
          </Text>
          <Text style={styles.sub}>{task.purpose}</Text>
        </View>
      </View>

      {draft?.geohash ? (
        <CellMap
          cells={[{ key: "report", cell: draft.geohash.slice(0, 5), tone: "self" }]}
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
      <View style={styles.steps}>
        {task.photos.map((spec, i) => {
          const photo = photos.find((p) => p.stepIndex === i);
          return (
            <Pressable
              key={i}
              onPress={() => retake(i)}
              accessibilityRole="button"
              accessibilityLabel={`Photo ${i + 1}: ${spec.prompt}. ${photo ? "Taken. Tap to take again." : "Missing. Tap to take it."}`}
              style={({ pressed }) => [styles.step, pressed && styles.pressed]}
            >
              <View>
                {photo ? (
                  <Image source={{ uri: photo.uri }} style={styles.thumb} />
                ) : (
                  <View style={[styles.thumb, styles.thumbEmpty]}>
                    <Icon name="camera" size={24} color={color.muted} />
                  </View>
                )}
                <View style={[styles.num, photo ? styles.numDone : null]}>
                  <Text style={styles.numText}>{i + 1}</Text>
                </View>
              </View>
              <Text style={styles.stepText} numberOfLines={3}>
                {spec.prompt}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {answered.length > 0 ? (
        <View style={{ gap: space.sm }}>
          <Text style={styles.section}>Current condition</Text>
          {answered.map((q) => (
            <Pressable
              key={q.id}
              onPress={() => router.push({ pathname: "/report/questions", params: { id: task.id } })}
              accessibilityRole="button"
              accessibilityLabel={`${q.text} ${answers[q.id]}. Tap to change.`}
              style={({ pressed }) => [styles.answer, pressed && styles.pressed]}
            >
              <Text style={styles.answerQ}>{q.text}</Text>
              <View style={styles.answerRow}>
                <View style={styles.chip}>
                  <Icon name="check" size={16} color={color.success} />
                  <Text style={styles.chipText}>{answers[q.id]}</Text>
                </View>
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
  header: { flexDirection: "row", alignItems: "center", gap: space.md },
  title: { ...type.display, color: color.text },
  sub: { ...type.meta, color: color.muted },
  section: { ...type.subtitle, color: color.text },
  sectionMeta: { ...type.body, color: color.muted, fontWeight: "400" },
  steps: { flexDirection: "row", gap: space.md },
  step: { flex: 1, alignItems: "center", gap: space.sm },
  thumb: { width: 84, height: 84, borderRadius: radius.pill, backgroundColor: color.surfaceSoft },
  thumbEmpty: { alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderStyle: "dashed", borderColor: color.border },
  num: {
    position: "absolute",
    top: -2,
    left: -2,
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    backgroundColor: color.muted,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: color.background,
  },
  numDone: { backgroundColor: color.success },
  numText: { ...type.meta, fontWeight: "700", color: color.onPrimary },
  stepText: { ...type.meta, color: color.text, textAlign: "center" },
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
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    minHeight: target.min - space.xs,
    paddingHorizontal: space.md,
    borderRadius: radius.sm,
    backgroundColor: color.successSoft,
  },
  chipText: { ...type.subtitle, color: color.text },
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
