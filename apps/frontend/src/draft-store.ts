// draft-store.ts: durable, offline, network-free persistence for the ONE report the
// reporter is building right now. Every function guard-wrapped and never throws
// (same contract as src/queue.ts). Photos + answers are copied into the app's private
// document directory only — nothing here changes what leaves the device. Distinct from
// src/report-draft.ts (in-memory fast-path state) and src/queue.ts (the durable proof queue).

import type { ReportDraft } from "./report-draft";

const DRAFT_DIR_NAME = "report-draft";
const DRAFT_FILE = "draft.json";

/** Shape written to disk. Photos carry a stable copied URI + step, never raw bytes. */
interface PersistedPhoto {
  uri: string;
  stepIndex: number;
}
interface PersistedDraft {
  taskId: string;
  reportId: string;
  answers: Record<string, string>;
  geohash: string;
  areaLabel: string;
  preciseLocationCipher: string;
  livenessChecked: boolean;
  livenessVerified: boolean;
  livenessDegraded: boolean;
  startedAt: number;
  photos: PersistedPhoto[];
}

/**
 * Storage seam. The default backend is expo-file-system; unit tests inject an
 * in-memory one. Any method may reject — every caller below guards.
 */
export interface DraftStoreBackend {
  /** Create the draft dir if missing. */
  ensureDir(): Promise<void>;
  /** Read the draft JSON, or null when it does not exist. */
  readDraft(): Promise<string | null>;
  /** Write the draft JSON. */
  writeDraft(text: string): Promise<void>;
  /** Remove the whole draft dir and its contents. */
  removeDir(): Promise<void>;
  /** Copy a captured photo into the draft dir; return the new stable URI. */
  copyIn(srcUri: string, destName: string): Promise<string>;
  /** Read a stored photo file as raw bytes. */
  readBytes(uri: string): Promise<Uint8Array>;
}

let injected: DraftStoreBackend | null = null;
let deviceBackend: DraftStoreBackend | null = null;

/** Test seam: swap the storage backend. Pass null to restore the device default. */
export function __setDraftStoreBackend(b: DraftStoreBackend | null): void {
  injected = b;
  copied.clear();
}

async function backend(): Promise<DraftStoreBackend | null> {
  if (injected) return injected;
  if (deviceBackend) return deviceBackend;
  try {
    // Guarded dynamic import: where the native module is unavailable (Node tests, and
    // a cold Expo Go dev cache offline) this rejects and persistence simply no-ops —
    // the in-memory draft stays the live copy and nothing on the report path throws.
    const { Paths, File, Directory } = await import("expo-file-system");
    const dir = new Directory(Paths.document, DRAFT_DIR_NAME);
    const draftFile = () => new File(dir, DRAFT_FILE);
    deviceBackend = {
      async ensureDir() {
        if (!dir.exists) dir.create({ intermediates: true });
      },
      async readDraft() {
        const f = draftFile();
        return f.exists ? await f.text() : null;
      },
      async writeDraft(text) {
        const f = draftFile();
        if (!f.exists) f.create();
        f.write(text);
      },
      async removeDir() {
        if (dir.exists) dir.delete();
      },
      async copyIn(srcUri, destName) {
        const dest = new File(dir, destName);
        if (dest.exists) dest.delete();
        await new File(srcUri).copy(dest);
        return dest.uri;
      },
      async readBytes(uri) {
        return new File(uri).bytes();
      },
    };
    return deviceBackend;
  } catch {
    return null;
  }
}

function photoName(reportId: string, stepIndex: number): string {
  return `photo-${reportId}-${stepIndex}.jpg`;
}

// Photos already copied for the open draft: `${reportId}:${stepIndex}` -> { src, dest }.
const copied = new Map<string, { src: string; dest: string }>();

function toPersisted(d: ReportDraft, photos: PersistedPhoto[]): PersistedDraft {
  return {
    taskId: d.taskId,
    reportId: d.reportId,
    answers: d.answers,
    geohash: d.geohash,
    areaLabel: d.areaLabel,
    preciseLocationCipher: d.preciseLocationCipher,
    livenessChecked: d.livenessChecked,
    livenessVerified: d.livenessVerified,
    livenessDegraded: d.livenessDegraded,
    startedAt: d.startedAt,
    photos,
  };
}

/**
 * Write the whole open draft through to disk. Fire-and-forget from report-draft.ts;
 * never throws. New photos are copied into the draft dir first so a later resume can
 * re-read their bytes even after the camera cache is cleared.
 */
export async function persistDraft(d: ReportDraft): Promise<void> {
  try {
    const store = await backend();
    if (!store) return;
    await store.ensureDir();
    const photos: PersistedPhoto[] = [];
    for (const p of d.photos) {
      const key = `${d.reportId}:${p.stepIndex}`;
      const prev = copied.get(key);
      let dest = prev?.dest;
      if (!prev || prev.src !== p.uri) {
        try {
          dest = await store.copyIn(p.uri, photoName(d.reportId, p.stepIndex));
          copied.set(key, { src: p.uri, dest });
        } catch {
          dest = p.uri; // Keep the original URI; still valid this session.
        }
      }
      photos.push({ uri: dest ?? p.uri, stepIndex: p.stepIndex });
    }
    await store.writeDraft(JSON.stringify(toPersisted(d, photos)));
  } catch {
    // Non-fatal: the in-memory draft remains the source of truth this session.
  }
}

/** Load the persisted draft into a ReportDraft (photos have no bytes). Null on anything wrong. */
export async function loadPersistedDraft(): Promise<ReportDraft | null> {
  try {
    const store = await backend();
    if (!store) return null;
    await store.ensureDir();
    const text = await store.readDraft();
    if (!text) return null;
    const p = JSON.parse(text) as Partial<PersistedDraft>;
    if (!p || typeof p.taskId !== "string" || !Array.isArray(p.photos)) return null;
    return {
      taskId: p.taskId,
      reportId: typeof p.reportId === "string" ? p.reportId : "",
      answers: p.answers ?? {},
      geohash: p.geohash ?? "",
      areaLabel: p.areaLabel ?? "",
      preciseLocationCipher: p.preciseLocationCipher ?? "",
      livenessChecked: Boolean(p.livenessChecked),
      livenessVerified: Boolean(p.livenessVerified),
      livenessDegraded: Boolean(p.livenessDegraded),
      startedAt: typeof p.startedAt === "number" ? p.startedAt : Date.now(),
      photos: p.photos
        .filter((ph): ph is PersistedPhoto => !!ph && typeof ph.uri === "string")
        .map((ph) => ({ uri: ph.uri, stepIndex: Number(ph.stepIndex) || 0 })),
    };
  } catch {
    return null;
  }
}

/** Wipe the persisted draft. Never throws. */
export async function clearPersistedDraft(): Promise<void> {
  try {
    copied.clear();
    const store = await backend();
    if (!store) return;
    await store.removeDir();
  } catch {
    // ignore
  }
}

/** Lightweight probe for the resume prompt. Null when there is nothing to resume. */
export async function hasPersistedDraft(): Promise<{
  taskId: string;
  startedAt: number;
  photos: number;
  answers: number;
} | null> {
  const d = await loadPersistedDraft();
  if (!d) return null;
  return {
    taskId: d.taskId,
    startedAt: d.startedAt,
    photos: d.photos.length,
    answers: Object.keys(d.answers).length,
  };
}

/** Re-read a persisted photo's bytes to hydrate DraftPhoto.bytes on resume. Null on any failure. */
export async function readPersistedPhotoBytes(uri: string): Promise<Uint8Array | null> {
  try {
    const store = await backend();
    if (!store) return null;
    return await store.readBytes(uri);
  } catch {
    return null;
  }
}
