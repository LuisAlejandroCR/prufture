// report-check.ts: is the report complete enough to save? Lists what is missing, in flow order —
// photo steps not taken, required questions not answered, no approximate area — so Review can block
// "Save report" and link straight to each gap. Pure; no react-native import.

import type { TaskDef } from "./tasks";

export type Missing =
  | { kind: "photo"; step: number; label: string }
  | { kind: "answer"; index: number; label: string }
  | { kind: "area"; label: string };

interface DraftLike {
  photos: { stepIndex: number }[];
  answers: Record<string, string>;
  geohash: string;
}

export function missingItems(task: TaskDef, draft: DraftLike | null): Missing[] {
  const out: Missing[] = [];
  task.photos.forEach((p, step) => {
    if (!draft?.photos.some((x) => x.stepIndex === step)) out.push({ kind: "photo", step, label: p.prompt });
  });
  task.questions.forEach((q, index) => {
    if (q.required && !draft?.answers[q.id]) out.push({ kind: "answer", index, label: q.text });
  });
  if (!draft?.geohash) out.push({ kind: "area", label: "Approximate area" });
  return out;
}

/** The `q` route param as a question index, clamped to the task's questions. */
export function questionIndex(raw: string | undefined, total: number): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || total <= 0) return 0;
  return Math.max(0, Math.min(total - 1, n));
}
