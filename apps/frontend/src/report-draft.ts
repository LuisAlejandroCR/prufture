// report-draft.ts: state for the guided report being built. In-memory `current` is the fast path;
// every mutation writes through to draft-store.ts (fire-and-forget) so an app kill loses nothing.
// Nothing is signed here: on "Finish" the draft becomes one signed proof per photo via capture.ts.

// `./capture` pulls in the native keystore + sqlite. It is NOT imported here (that would
// break the off-device unit tests); the real captureProof is injected once at app start
// from app/report/review.tsx via setCaptureProof(). Type-only import is erased at build.
import type { captureProof as CaptureProofFn } from "./capture";
import {
  clearPersistedDraft,
  loadPersistedDraft,
  persistDraft,
  readPersistedPhotoBytes,
} from "./draft-store";
import { queueOptInEvidence } from "./evidence-share";
import { loadLivenessPass } from "./face-liveness";
import { livenessProvider } from "./flags";
import { attachLiveness } from "./liveness";
import { sanitizeNote, saveLocalNote } from "./report-note";
import { attachPreciseLocation } from "./sync";
import type { TaskDef } from "./tasks";
import { firstOpenQuestion } from "./question-flow";

// Re-exported so screens can drive the resume prompt through this one module.
export { clearPersistedDraft, hasPersistedDraft } from "./draft-store";

/** A persisted draft older than this is not offered for resume. */
export const DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

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
  /** Local file URI (camera cache during the session, or the draft-store copy on resume). */
  uri: string;
  /** Raw photo bytes. Present on the capture fast path; undefined after a resume until
   *  saveDraft() re-reads them from the draft-store copy at `uri`. */
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
  /** Optional private note (<=280 chars). Local only: never signed, synced or passed to captureProof. */
  note: string;
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
  /** True when the check ran but the provider was degraded (not an actual failed check). */
  livenessDegraded: boolean;
  /** The api's signed receipt for the verdict above (booleans + time + MAC). "" if none. */
  livenessTicket: string;
  /**
   * Reporter's per-report opt-in to share the photos, sealed to the programme key (review step).
   * Absent or false = off, the default: photos stay on this phone.
   */
  shareEvidence?: boolean;
  startedAt: number;
}

let current: ReportDraft | null = null;

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

export function startDraft(taskId: string): ReportDraft {
  current = {
    taskId,
    reportId: newReportId(),
    photos: [],
    answers: {},
    note: "",
    geohash: "",
    areaLabel: "",
    preciseLocationCipher: "",
    livenessChecked: false,
    livenessVerified: false,
    livenessDegraded: false,
    livenessTicket: "",
    startedAt: Date.now(),
  };
  void persistDraft(current);
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

/** Load the persisted draft (if any) into memory as the open draft. */
export async function restoreDraft(): Promise<ReportDraft | null> {
  current = await loadPersistedDraft();
  return current;
}

export function addPhoto(photo: DraftPhoto): void {
  if (!current) return;
  current.photos = [...current.photos.filter((p) => p.stepIndex !== photo.stepIndex), photo].sort(
    (a, b) => a.stepIndex - b.stepIndex,
  );
  void persistDraft(current);
}

export function setAnswer(questionId: string, value: string): void {
  if (!current) return;
  current.answers = { ...current.answers, [questionId]: value };
  void persistDraft(current);
}

export function setNote(text: string): void {
  if (!current) return;
  current.note = sanitizeNote(text);
  void persistDraft(current);
}

export function setArea(geohash: string, areaLabel: string): void {
  if (!current) return;
  current.geohash = geohash;
  current.areaLabel = areaLabel;
  void persistDraft(current);
}

/** Store the encrypted precise-location blob for this report. Opaque hex from sealPrecise(). */
export function setPreciseLocation(cipherHex: string): void {
  if (!current) return;
  current.preciseLocationCipher = cipherHex;
  void persistDraft(current);
}

/** The review-step opt-in. Only an explicit `true` shares; anything else is off. */
export function setShareEvidence(on: boolean): void {
  if (!current) return;
  current.shareEvidence = on === true;
  void persistDraft(current);
}

export function setLiveness(checked: boolean, verified: boolean, degraded = false, ticket = ""): void {
  if (!current) return;
  current.livenessChecked = checked;
  current.livenessVerified = checked ? verified : false;
  current.livenessDegraded = checked ? degraded : false;
  current.livenessTicket = checked ? ticket : "";
  void persistDraft(current);
}

export function clearDraft(): void {
  current = null;
  void clearPersistedDraft();
}

export interface ResumeTarget {
  pathname: string;
  params: Record<string, string>;
}

/** True when a persisted-draft probe is recent enough and has something worth resuming. */
export function isResumable(
  meta: { startedAt: number; photos: number; answers: number } | null,
): boolean {
  if (!meta) return false;
  if (Date.now() - meta.startedAt > DRAFT_MAX_AGE_MS) return false;
  return meta.photos > 0 || meta.answers > 0;
}

/** The step to drop the reporter back into when resuming `draft` for `task`. */
export function resumeTarget(draft: ReportDraft, task: TaskDef): ResumeTarget {
  const id = task.id;
  if (draft.photos.length < task.photos.length) {
    return { pathname: "/report/capture", params: { id, step: String(draft.photos.length) } };
  }
  const open = firstOpenQuestion(task.questions, draft.answers);
  if (open >= 0) {
    return { pathname: "/report/questions", params: { id, q: String(open) } };
  }
  if (!draft.geohash) {
    return { pathname: "/report/location", params: { id } };
  }
  return { pathname: "/report/review", params: { id } };
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
  const proofHashes: string[] = [];
  const sealedForSharing: { proofHash: string; bytes: Uint8Array }[] = [];

  const captureProof = captureProofImpl;
  if (!captureProof) return { saved: 0, failed: draft.photos.length, firstProofHash: null };

  for (const photo of draft.photos) {
    try {
      const bytes = photo.bytes ?? (await readPersistedPhotoBytes(photo.uri)) ?? undefined;
      if (!bytes) {
        failed += 1;
        continue;
      }
      const proof = await captureProof({
        taskId: draft.taskId,
        mediaBytes: bytes,
        geohash: draft.geohash,
        mediaUri: photo.uri,
        reportId: draft.reportId,
      });
      firstProofHash = firstProofHash ?? proof.proofHash;
      proofHashes.push(proof.proofHash);
      if (draft.shareEvidence === true) sealedForSharing.push({ proofHash: proof.proofHash, bytes });
      saved += 1;
    } catch {
      failed += 1;
    }
  }

  // The payload is unchanged. Separately — and only if a liveness check ran — tell the
  // api to store the verified-person boolean against every proofHash of the report: any photo's
  // public record can be the one shared. Fire-and-forget: it never blocks the "saved" screen
  // and retries on the next sync pass if offline.
  // The note stays on this phone, next to the report it describes. Awaited so it lands before
  // clearDraft() wipes the draft; saveLocalNote never throws.
  if (saved > 0 && draft.note) await saveLocalNote(draft.reportId, draft.note);

  // Opt-in only: the photos are sealed to the programme key HERE, while their bytes are in memory,
  // and only the ciphertext is queued. The sync pass posts it once the proof is on the api.
  // Awaited so the bytes are sealed before clearDraft(); queueOptInEvidence never throws.
  if (sealedForSharing.length > 0) await queueOptInEvidence(sealedForSharing);

  if (firstProofHash) {
    const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8787";
    let ticket = "";
    if (draft.livenessChecked && draft.livenessTicket) {
      ticket = draft.livenessTicket;
    } else if (livenessProvider() === "aws") {
      // The one-time face check: its pass rides on every report while it is still usable. No pass,
      // no attach — verifiedPerson just stays null, and the report is never held back for it.
      const pass = await loadLivenessPass();
      if (pass) ticket = pass.ticket;
    }
    if (ticket) for (const hash of proofHashes) void attachLiveness(apiUrl, hash, ticket);
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
