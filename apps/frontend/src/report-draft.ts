// report-draft.ts: in-memory state for the guided report the reporter is building now.
// This is session UI state only. Nothing here is persisted and nothing new is signed:
// on "Finish", the draft is turned into proofs through the existing src/capture.ts path,
// one signed proof per photo, all carrying the same raw taskId. Distinct from src/queue.ts
// (the durable offline queue) and src/report-draft is cleared once the report is saved.

// `./capture` pulls in the native keystore + sqlite; import it lazily so this
// module (in-memory draft state) stays unit-testable off-device.
import type { captureProof as CaptureProof } from "./capture";

/**
 * 16 random bytes as hex, from the same global crypto shim that ed25519 uses
 * (react-native-get-random-values, bound in app/_layout.tsx). Local-only id:
 * it groups the per-photo proofs of one report and is never signed or sent.
 */
export function newReportId(): string {
  const b = new Uint8Array(16);
  globalThis.crypto.getRandomValues(b);
  return Array.from(b, (n) => n.toString(16).padStart(2, "0")).join("");
}

export interface DraftPhoto {
  /** Local file URI from expo-camera. Stays on the device. */
  uri: string;
  /** Raw photo bytes, kept only until the draft is saved. */
  bytes: Uint8Array;
  /** Which capture step this satisfies. */
  stepIndex: number;
}

export interface ReportDraft {
  taskId: string;
  /** Local-only id shared by every proof this draft produces. Never signed or sent. */
  reportId: string;
  photos: DraftPhoto[];
  answers: Record<string, string>;
  /** Coarse geohash (<=5 chars) or "" when location was skipped or denied. */
  geohash: string;
  /** Area label shown back to the reporter. */
  areaLabel: string;
  startedAt: number;
}

let current: ReportDraft | null = null;

export function startDraft(taskId: string): ReportDraft {
  current = {
    taskId,
    reportId: newReportId(),
    photos: [],
    answers: {},
    geohash: "",
    areaLabel: "",
    startedAt: Date.now(),
  };
  return current;
}

export function getDraft(): ReportDraft | null {
  return current;
}

/** Read the draft, starting a fresh one for `taskId` if none is open. */
export function ensureDraft(taskId: string): ReportDraft {
  if (!current || current.taskId !== taskId) return startDraft(taskId);
  return current;
}

export function addPhoto(photo: DraftPhoto): void {
  if (!current) return;
  current.photos = [...current.photos.filter((p) => p.stepIndex !== photo.stepIndex), photo].sort(
    (a, b) => a.stepIndex - b.stepIndex,
  );
}

export function setAnswer(questionId: string, value: string): void {
  if (!current) return;
  current.answers = { ...current.answers, [questionId]: value };
}

export function setArea(geohash: string, areaLabel: string): void {
  if (!current) return;
  current.geohash = geohash;
  current.areaLabel = areaLabel;
}

export function clearDraft(): void {
  current = null;
}

export interface SaveResult {
  saved: number;
  failed: number;
  firstProofHash: string | null;
}

/**
 * Turn the open draft into signed, queued proofs using the existing capture path.
 * One proof per photo. No new protocol: captureProof -> enqueueProof, status pending_sync.
 * The auto-sync loop drains them when signal returns, exactly as before.
 */
export async function saveDraft(): Promise<SaveResult> {
  const draft = current;
  if (!draft) return { saved: 0, failed: 0, firstProofHash: null };

  let saved = 0;
  let failed = 0;
  let firstProofHash: string | null = null;

  const captureProof: typeof CaptureProof = (await import("./capture")).captureProof;

  for (const photo of draft.photos) {
    try {
      const proof = await captureProof({
        taskId: draft.taskId,
        mediaBytes: photo.bytes,
        geohash: draft.geohash,
        mediaUri: photo.uri,
        reportId: draft.reportId,
      });
      firstProofHash = firstProofHash ?? proof.proofHash;
      saved += 1;
    } catch {
      failed += 1;
    }
  }

  if (failed === 0) clearDraft();
  return { saved, failed, firstProofHash };
}
