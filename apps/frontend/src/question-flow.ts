// question-flow.ts: where the Questions step goes next. Each question is its own stack screen (the
// `q` route param), so the iOS edge swipe, Android back and the in-screen Back all land on the
// previous question. Editing from Review returns to that same Review. Pure, no React Native.

/** The question a route param points at, clamped to a real question (0 when there are none). */
export function questionIndex(param: string | undefined, total: number): number {
  const n = Number(param ?? "0");
  if (!Number.isInteger(n) || total <= 0) return 0;
  return Math.max(0, Math.min(total - 1, n));
}

export type AfterQuestion = { kind: "question"; index: number } | { kind: "location" } | { kind: "review" };

/** What "Next" / "Continue" does on question `index` of `total`. */
export function afterQuestion(o: { index: number; total: number; fromReview: boolean }): AfterQuestion {
  if (o.fromReview) return { kind: "review" };
  if (o.index + 1 < o.total) return { kind: "question", index: o.index + 1 };
  return { kind: "location" };
}

/** Index of the first required question without an answer, or -1 when all are answered. */
export function firstOpenQuestion(
  questions: { id: string; required?: boolean }[],
  answers: Record<string, string | undefined>,
): number {
  return questions.findIndex((q) => q.required && !answers[q.id]);
}
