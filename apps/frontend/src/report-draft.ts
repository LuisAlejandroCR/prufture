// report-draft.ts: in-memory state for the guided report the reporter is building now.
// This is session UI state only. Nothing here is persisted and nothing new is signed:
// on "Finish", the draft is turned into proofs through the existing src/capture.ts path,
// one signed proof per photo, all carrying the same raw taskId. Distinct from src/queue.ts
// (the durable offline queue); src/report-draft is cleared once the report is saved.

// `./capture` pulls in the native keystore + sqlite. It is NOT imported here (that would
// break the off-device unit tests AND, as a dynamic import(), reject with
// LoadBundleFromServerRequest in Expo Go offline). The real captureProof is injected once
// at app start from app/report/review.tsx via setCaptureProof(). Type-only import is erased.
import type { captureProof as CaptureProofFn } from "./capture";
import { attachLiveness } from "./liveness";
import { attachPreciseLocation } from "./sync";

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
  /** Raw photo bytes, kept until the draft is saved. */
  bytes?: Uint8Array;
  /** Which capture step this satisfies. */
  stepIndex: number;
}

export interface ReportDraft {
  taskId: string;
  /** Local-only id shared by every proof this draft produces. Never signed or sent. */
  reportId: string;
  photos: DraftPhoto[];
  answers: Record<string, string>;
  /** Coarse geohash (<=5 chars). Location is mandatory, so this is set before review. */
  geohash: string;
  /** Area label shown back to the reporter. */
  areaLabel: string;
  /**
   * The precise location point, encrypted on-device to the programme team's key
   * (see src/location-seal.ts). Opaque hex. "" until the location step runs.
   * Never signed, never on-chain — synced to the api as a separate opaque blob.
   */
  preciseLocationCipher: string;
  /** True once the selfie liveness challenge produced a verdict (pass or fail). */
  livenessChecked: boolean;
  /** True only when a provider confirmed a live person. Booleans only — no ref, frame or nonce. */
  livenessVerified: boolean;
  startedAt: number;
}

let current: ReportDraft | null = null;

// --- capture-proof injection seam --------------------------------------------------

type CaptureProof = typeof CaptureProofFn;
let captureProofImpl: CaptureProof | null = null;

/** Wire the real src/capture.captureProof. Called once at module load from review.tsx. */
export function setCaptureProof(fn: CaptureProof): void {
  captureProofImpl = fn;
}

/** Test seam: inject a fake captureProof. Pass null to clear. */
export function __setCaptureProofForTest(fn: CaptureProof | null): void {
  captureProofImpl = fn;
}

// --- draft lifecycle --------------------------------------------------------------

export function startDraft(taskId: string): ReportDraft {
  current = {
    taskId,
    reportId: newReportId(),
    photos: [],
    answers: {},
    geohash: "",
    areaLabel: "",
    preciseLocationCipher: "",
    livenessChecked: false,
    livenessVerified: false,
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

/** Store the encrypted precise-location blob for this report. Opaque hex from sealPrecise(). */
export function setPreciseLocation(cipherHex: string): void {
  if (!current) return;
  current.preciseLocationCipher = cipherHex;
}

export function setLiveness(checked: boolean, verified: boolean): void {
  if (!current) return;
  current.livenessChecked = checked;
  current.livenessVerified = checked ? verified : false;
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
 * The auto-sync loop drains them when signal returns, exactly as before. Never rejects:
 * a missing capture impl or an unreadable photo just counts as a failure.
 */
export async function saveDraft(): Promise<SaveResult> {
  const draft = current;
  if (!draft) return { saved: 0, failed: 0, firstProofHash: null };

  let saved = 0;
  let failed = 0;
  let firstProofHash: string | null = null;

  const captureProof = captureProofImpl;
  if (!captureProof) return { saved: 0, failed: draft.photos.length, firstProofHash: null };

  for (const photo of draft.photos) {
    try {
      if (!photo.bytes) {
        failed += 1;
        continue;
      }
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

  // The payload is unchanged. Separately — and only if a liveness check ran — tell the
  // api to store the verified-person boolean against the first proofHash. Fire-and-forget:
  // it never blocks the "saved" screen and retries on the next sync pass if offline.
  if (firstProofHash) {
    const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8787";
    if (draft.livenessChecked) {
      void attachLiveness(apiUrl, firstProofHash, draft.livenessVerified);
    }
    // The signed payload stays coarse-only. The encrypted precise point is sent
    // separately as an opaque blob, keyed to this proofHash. Fire-and-forget: it
    // buffers and retries on the next sync pass if offline.
    if (draft.preciseLocationCipher) {
      void attachPreciseLocation(apiUrl, firstProofHash, draft.preciseLocationCipher);
    }
  }

  if (failed === 0) clearDraft();
  return { saved, failed, firstProofHash };
}
