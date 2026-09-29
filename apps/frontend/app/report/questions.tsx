// report/questions.tsx: only the answers needed to understand the activity — one question per view,
// large choices toned by meaning (works / problem / unsure, src/answer-tone.ts), no free text, no PII. Answers live in the in-memory draft and survive going offline.
// Each question is its own stack screen (`q` param, src/question-flow.ts), so the iOS swipe back and
// the Back control both return to the previous question; `from=review` edits one answer and pops back.

import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { answerTone } from "../../src/answer-tone";
import { Icon } from "../../src/components/icons/Icon";
import { BackLink, CategoryBadge, PrimaryButton, ReportProgress, Screen } from "../../src/components/ui";
import { select } from "../../src/feedback";
import { identityStepEnabled } from "../../src/flags";
import { afterQuestion, questionIndex } from "../../src/question-flow";
import { ensureDraft, getDraft, setAnswer } from "../../src/report-draft";
import { getTask } from "../../src/tasks";
import { color, radius, space, target, type } from "../../src/theme";

export default function ReportQuestionsScreen() {
  const { id, q: qParam, from } = useLocalSearchParams<{ id: string; q?: string; from?: string }>();
  const router = useRouter();
  const task = getTask(id ?? "");
  ensureDraft(task.id);

  const questions = task.questions;
  const index = questionIndex(qParam, questions.length);
  const fromReview = from === "review";
  const q = questions[index];
  const [, force] = useState(0);
  const current = getDraft()?.answers[q?.id ?? ""] ?? null;

  if (!q) {
    router.replace({ pathname: "/report/location", params: { id: task.id } });
    return null;
  }

  const choose = (value: string) => {
    if (value !== current) void select();
    setAnswer(q.id, value);
    force((n) => n + 1);
  };

  const advance = () => {
    const next = afterQuestion({ index, total: questions.length, fromReview });
    if (next.kind === "review") router.back();
    else if (next.kind === "question") {
      router.push({ pathname: "/report/questions", params: { id: task.id, q: String(next.index) } });
    } else router.push({ pathname: "/report/location", params: { id: task.id } });
  };

  const back = () => router.back();

  return (
    <Screen
      footer={
        <PrimaryButton
          label={index + 1 < questions.length ? "Next" : "Continue"}
          onPress={advance}
          disabled={q.required && !current}
          accessibilityHint={q.required && !current ? "Choose an answer to continue" : undefined}
        />
      }
    >
      <BackLink label="Back" onPress={back} />
      <ReportProgress
        step={identityStepEnabled() ? 3 : 2}
        total={identityStepEnabled() ? 4 : 3}
        label="Questions"
      />
      <View style={styles.context}>
        <CategoryBadge category={task.category} size={36} />
        <Text style={styles.contextText} numberOfLines={2}>
          {task.title}
        </Text>
      </View>
      <Text style={styles.count}>
        Question {index + 1} of {questions.length}
        {q.required ? "" : "  ·  optional"}
      </Text>
      <Text style={styles.question} accessibilityRole="header">
        {q.text}
      </Text>

      <View style={{ gap: space.sm }}>
        {q.options.map((opt) => {
          const selected = current === opt;
          const tone = TONE[answerTone(opt)];
          return (
            <Pressable
              key={opt}
              onPress={() => choose(opt)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={opt}
              style={[styles.option, selected && { borderColor: tone.fg, backgroundColor: tone.bg }]}
            >
              <View style={[styles.optionIcon, { backgroundColor: tone.bg }]}>
                <Icon name={tone.icon} size={18} color={tone.fg} />
              </View>
              <Text style={[styles.optionText, selected && styles.optionTextSelected]}>{opt}</Text>
              {selected ? <Icon name="check" size={18} color={color.text} /> : null}
            </Pressable>
          );
        })}
      </View>
    </Screen>
  );
}

const TONE = {
  good: { bg: color.successSoft, fg: color.success, icon: "check" as const },
  bad: { bg: color.warningSoft, fg: color.warning, icon: "warning" as const },
  neutral: { bg: color.surfaceSoft, fg: color.muted, icon: "info" as const },
};

const styles = StyleSheet.create({
  context: { flexDirection: "row", alignItems: "center", gap: space.sm },
  contextText: { ...type.meta, color: color.muted, fontWeight: "600", flex: 1 },
  optionIcon: { width: 32, height: 32, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  count: { ...type.meta, color: color.muted, fontWeight: "600" },
  question: { ...type.display, color: color.text },
  option: {
    minHeight: target.primary,
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: color.border,
    backgroundColor: color.surface,
  },
  optionText: { ...type.subtitle, color: color.text, flex: 1 },
  optionTextSelected: { fontWeight: "700" },
});
