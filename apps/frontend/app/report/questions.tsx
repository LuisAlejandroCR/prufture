// report/questions.tsx: only the answers needed to understand the activity.
// One question per view, large choice buttons, progress, no free text, no PII.
// Answers are held in the in-memory draft and survive going offline.

import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Icon } from "../../src/components/icons/Icon";
import { BackLink, PrimaryButton, ReportProgress, Screen } from "../../src/components/ui";
import { identityStepEnabled } from "../../src/flags";
import { ensureDraft, getDraft, setAnswer } from "../../src/report-draft";
import { getTask } from "../../src/tasks";
import { color, radius, space, target, type } from "../../src/theme";

export default function ReportQuestionsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const task = getTask(id ?? "");
  ensureDraft(task.id);

  const questions = task.questions;
  const [index, setIndex] = useState(0);
  const q = questions[index];
  const [, force] = useState(0);
  const current = getDraft()?.answers[q?.id ?? ""] ?? null;

  if (!q) {
    router.replace({ pathname: "/report/location", params: { id: task.id } });
    return null;
  }

  const choose = (value: string) => {
    setAnswer(q.id, value);
    force((n) => n + 1);
  };

  const advance = () => {
    if (index + 1 < questions.length) {
      setIndex(index + 1);
    } else {
      router.replace({ pathname: "/report/location", params: { id: task.id } });
    }
  };

  const back = () => {
    if (index === 0) router.back();
    else setIndex(index - 1);
  };

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
          return (
            <Pressable
              key={opt}
              onPress={() => choose(opt)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={opt}
              style={[styles.option, selected && styles.optionSelected]}
            >
              <Text style={[styles.optionText, selected && styles.optionTextSelected]}>{opt}</Text>
              {selected ? <Icon name="check" size={18} color={color.primary} /> : null}
            </Pressable>
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  count: { ...type.meta, color: color.muted, fontWeight: "600" },
  question: { ...type.display, color: color.text },
  option: {
    minHeight: target.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: color.border,
    backgroundColor: color.surface,
  },
  optionSelected: { borderColor: color.primary, backgroundColor: color.primarySoft },
  optionText: { ...type.subtitle, color: color.text },
  optionTextSelected: { color: color.primary, fontWeight: "700" },
});
