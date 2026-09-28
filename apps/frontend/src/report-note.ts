// report-note.ts: the optional private note on a report. Sanitises and caps it (280 chars), and keeps
// saved notes in a local-only file keyed by the local reportId. Nothing here is signed, synced or sent;
// the note is context for the reporter, never part of the proof. Every function is guard-wrapped.

export const NOTE_MAX = 280;
const COUNTER_FROM = 200;
const MAX_STORED = 200;

// C0 controls except tab and newline, plus DEL.
const CONTROL = /[\u0000-\u0008\u000B-\u001F\u007F]/g;

export function sanitizeNote(raw: string): string {
  return raw.replace(CONTROL, "").trim().slice(0, NOTE_MAX);
}

/** "80 characters left" once the note reaches 200 characters, otherwise null. */
export function noteCounter(text: string): string | null {
  if (text.length < COUNTER_FROM) return null;
  const left = Math.max(0, NOTE_MAX - text.length);
  return `${left} ${left === 1 ? "character" : "characters"} left`;
}

/** Storage seam. The default backend is expo-file-system; unit tests inject an in-memory one. */
export interface NotesBackend {
  read(): Promise<string | null>;
  write(text: string): Promise<void>;
}

let injected: NotesBackend | null = null;
let deviceBackend: NotesBackend | null = null;

/** Test seam: swap the storage backend. Pass null to restore the device default. */
export function __setNotesBackend(b: NotesBackend | null): void {
  injected = b;
}

async function backend(): Promise<NotesBackend | null> {
  if (injected) return injected;
  if (deviceBackend) return deviceBackend;
  try {
    const { Paths, File, Directory } = await import("expo-file-system");
    const dir = new Directory(Paths.document, "report-notes");
    const file = () => new File(dir, "notes.json");
    deviceBackend = {
      async read() {
        const f = file();
        return f.exists ? await f.text() : null;
      },
      async write(text) {
        if (!dir.exists) dir.create({ intermediates: true });
        const f = file();
        if (!f.exists) f.create();
        f.write(text);
      },
    };
    return deviceBackend;
  } catch {
    return null;
  }
}

type Stored = { reportId: string; note: string }[];

async function readAll(store: NotesBackend): Promise<Stored> {
  const text = await store.read();
  if (!text) return [];
  const parsed = JSON.parse(text) as unknown;
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(
    (e): e is Stored[number] => !!e && typeof e.reportId === "string" && typeof e.note === "string",
  );
}

/** Keep a saved report's note on this phone. Empty notes are skipped. Never throws. */
export async function saveLocalNote(reportId: string, note: string): Promise<void> {
  const clean = sanitizeNote(note);
  if (!reportId || !clean) return;
  try {
    const store = await backend();
    if (!store) return;
    const all = (await readAll(store)).filter((e) => e.reportId !== reportId);
    all.push({ reportId, note: clean });
    await store.write(JSON.stringify(all.slice(-MAX_STORED)));
  } catch {
    // Non-fatal: the report itself is already saved.
  }
}

/** The note kept for a report, or null. Never throws. */
export async function getLocalNote(reportId: string): Promise<string | null> {
  try {
    const store = await backend();
    if (!store || !reportId) return null;
    return (await readAll(store)).find((e) => e.reportId === reportId)?.note ?? null;
  } catch {
    return null;
  }
}
