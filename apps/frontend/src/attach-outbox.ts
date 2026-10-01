// attach-outbox.ts: the durable retry list for what is sent AFTER a report's proof reaches the api —
// a face-check ticket (/liveness-result) and the sealed precise point (/precise-location). Both are
// first tried right after saving, which in the field is usually offline or before the proof has
// synced (404), so they wait here until a later sync pass. The list is kept on disk: an in-memory list
// was lost whenever the phone closed the app before signal came back, and with it the report's face
// check and precise point, for good. Holds only a server-signed ticket or ciphertext sealed to the
// programme key, never a photo or a plain location. Never throws.

export type AttachKind = "liveness" | "precise";

export interface AttachItem {
  kind: AttachKind;
  proofHash: string;
  /** The liveness ticket, or the precise-location ciphertext (hex). */
  value: string;
}

/** Enough for weeks of offline reports; the oldest entries go first past it. */
const MAX_ITEMS = 500;

/** Storage seam. The default backend is expo-file-system; unit tests inject an in-memory one. */
export interface AttachBackend {
  read(): Promise<string | null>;
  write(text: string): Promise<void>;
}

let injected: AttachBackend | null | undefined;
let deviceBackend: AttachBackend | null = null;
let cache: AttachItem[] | null = null;
let loading: Promise<AttachItem[]> | null = null;
let writing: Promise<void> = Promise.resolve();

/** Test seam: swap the storage backend (null = memory only). Also forgets the loaded list. */
export function __setAttachBackend(b: AttachBackend | null): void {
  injected = b;
  cache = null;
  loading = null;
}

async function backend(): Promise<AttachBackend | null> {
  if (injected !== undefined) return injected;
  if (deviceBackend) return deviceBackend;
  try {
    const { Paths, File, Directory } = await import("expo-file-system");
    const dir = new Directory(Paths.document, "attach-outbox");
    const file = () => new File(dir, "state.json");
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

function isItem(v: unknown): v is AttachItem {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    (o.kind === "liveness" || o.kind === "precise") &&
    typeof o.proofHash === "string" &&
    o.proofHash !== "" &&
    typeof o.value === "string" &&
    o.value !== ""
  );
}

async function load(): Promise<AttachItem[]> {
  if (cache) return cache;
  if (!loading) {
    loading = (async () => {
      let items: AttachItem[] = [];
      try {
        const store = await backend();
        const text = store ? await store.read() : null;
        const parsed: unknown = text ? JSON.parse(text) : [];
        if (Array.isArray(parsed)) items = parsed.filter(isItem);
      } catch {
        items = [];
      }
      // Anything added while the file was being read is kept.
      cache = [...items, ...(cache ?? [])];
      return cache;
    })();
  }
  return loading;
}

/** Writes are chained so an older snapshot can never land after a newer one. */
function persist(): Promise<void> {
  const snapshot = JSON.stringify((cache ?? []).slice(-MAX_ITEMS));
  writing = writing
    .then(async () => {
      const store = await backend();
      if (store) await store.write(snapshot);
    })
    .catch(() => undefined);
  return writing;
}

const same = (a: AttachItem, kind: AttachKind, proofHash: string) => a.kind === kind && a.proofHash === proofHash;

/** Keep `item` for a later sync pass. One entry per kind and proof; the first one stays. */
export async function outboxAdd(item: AttachItem): Promise<void> {
  if (!isItem(item)) return;
  const items = await load();
  if (items.some((a) => same(a, item.kind, item.proofHash))) return;
  items.push(item);
  if (items.length > MAX_ITEMS) items.splice(0, items.length - MAX_ITEMS);
  await persist();
}

/** The waiting entries of one kind, oldest first. */
export async function outboxItems(kind: AttachKind): Promise<AttachItem[]> {
  return (await load()).filter((a) => a.kind === kind);
}

/** Drop an entry once the api took it, or will never take it. */
export async function outboxRemove(kind: AttachKind, proofHash: string): Promise<void> {
  const items = await load();
  const i = items.findIndex((a) => same(a, kind, proofHash));
  if (i < 0) return;
  items.splice(i, 1);
  await persist();
}

/** Test-only: what is loaded right now (no disk read). */
export function __attachItems(kind: AttachKind): AttachItem[] {
  return (cache ?? []).filter((a) => a.kind === kind);
}

/** Test-only: forget every entry of one kind in memory and on the backend. */
export function __resetAttachKind(kind: AttachKind): void {
  if (cache) cache = cache.filter((a) => a.kind !== kind);
  else cache = [];
  void persist();
}
