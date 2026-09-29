// answer-tone.ts: how a closed answer is shown on Review and Questions. "good" (sage check) for answers
// that say the thing works, "bad" (amber warning) for missing / partial / broken, "neutral" for answers
// that could not check. Plus the saved-report count used on Sent. Pure; no react-native import.

import type { LocalProof } from "./queue-row";

export type AnswerTone = "good" | "bad" | "neutral";

const GOOD = new Set(["yes", "both", "most"]);
const NEUTRAL = new Set(["i could not confirm", "not tested", "not a school", "no display"]);

export function answerTone(option: string): AnswerTone {
  const o = option.trim().toLowerCase();
  if (NEUTRAL.has(o)) return "neutral";
  if (GOOD.has(o) || o.startsWith("yes")) return "good";
  return "bad";
}

/** Distinct reports on this phone (per-photo rows grouped by reportId). */
export function savedReportCount(rows: LocalProof[]): number {
  return new Set(rows.map((r) => r.reportId || `row:${r.id}`)).size;
}
