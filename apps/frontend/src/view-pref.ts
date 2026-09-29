// view-pref.ts: remembers whether Missions opens as List or Map. Stored in expo-secure-store like the
// feedback toggles; defaults to List, and any read or write failure just keeps the default. Display
// preference only, nothing about reports.

export type MissionsView = "list" | "map";

const KEY = "prufture.missions.view";

interface KeyValueStore {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
}

let injected: KeyValueStore | null = null;

/** Test seam: swap the store. Pass null to restore expo-secure-store. */
export function __setViewStore(store: KeyValueStore | null): void {
  injected = store;
}

async function store(): Promise<KeyValueStore | null> {
  if (injected) return injected;
  try {
    return await import("expo-secure-store");
  } catch {
    return null;
  }
}

export function parseView(raw: string | null): MissionsView {
  return raw === "map" ? "map" : "list";
}

export async function loadMissionsView(): Promise<MissionsView> {
  try {
    const s = await store();
    return parseView(s ? await s.getItemAsync(KEY) : null);
  } catch {
    return "list";
  }
}

export async function saveMissionsView(view: MissionsView): Promise<void> {
  try {
    const s = await store();
    await s?.setItemAsync(KEY, view);
  } catch {
    // Non-fatal: the choice still applies this session.
  }
}
