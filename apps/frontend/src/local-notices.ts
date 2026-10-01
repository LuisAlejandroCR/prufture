// local-notices.ts: notices the phone works out for itself and shows as LOCAL notifications, so no
// server or push service ever learns who to tell. Nearby missions (from the missions bundled in the
// app and this phone's approximate area), a report confirmed by the community (the same public
// confirmations route the report screen reads), and a programme photo request (the requests the sync
// pass already fetches with the device's evidence tokens). Plus the coordinator's "new since your
// last visit". Each notice can be switched off and none repeats. Never throws; native modules are
// injected or lazy-imported, so this file tests under node.

import { fetchConfirmations, liveConfirmations } from "./confirmations";
import { pendingEvidenceRequests } from "./evidence-share";
import { identityStepEnabled } from "./flags";
import type { LocalProof } from "./queue-row";
import { getTask } from "./tasks";

export interface NoticePrefs {
  missions: boolean;
  confirmations: boolean;
  photoRequests: boolean;
}

export const DEFAULT_PREFS: NoticePrefs = { missions: true, confirmations: true, photoRequests: true };

/** Confirmations fetched per sync pass at most, newest reports first: bounds the requests per run. */
export const MAX_CONFIRMATION_CHECKS = 10;
export const MISSIONS_REMINDER_ID = "nearby-missions";

const PREFS_KEY = "prufture.notices.prefs";
const SENT_KEY = "prufture.notices.sent";
const COORDINATOR_VISIT_KEY = "prufture.coordinator.lastVisit";
const PENDING = "pending_sync";

interface KeyValueStore {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string, options?: { keychainAccessible?: number }): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
  AFTER_FIRST_UNLOCK?: number;
}

let injected: KeyValueStore | null = null;

/** Test seam: swap the store. Pass null to restore expo-secure-store. */
export function __setNoticeStore(store: KeyValueStore | null): void {
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

/** The stored value over the fallback, or null when the store cannot be read (a locked phone). */
async function readStrict<T>(key: string, fallback: T): Promise<T | null> {
  try {
    const s = await store();
    if (!s) return null;
    const raw = await s.getItemAsync(key);
    return raw ? ({ ...fallback, ...JSON.parse(raw) } as T) : fallback;
  } catch {
    return null;
  }
}

async function readJson<T>(key: string, fallback: T): Promise<T> {
  return (await readStrict(key, fallback)) ?? fallback;
}

async function writeJson(key: string, value: unknown): Promise<void> {
  try {
    const s = await store();
    // Not secret: readable after the first unlock, so a background run on a locked phone sees it.
    await s?.setItemAsync(key, JSON.stringify(value), { keychainAccessible: s.AFTER_FIRST_UNLOCK });
  } catch {
    // Non-fatal: at worst a notice repeats or a switch resets.
  }
}

export async function loadNoticePrefs(): Promise<NoticePrefs> {
  return readJson(PREFS_KEY, DEFAULT_PREFS);
}

export async function setNoticePref(key: keyof NoticePrefs, value: boolean): Promise<void> {
  await writeJson(PREFS_KEY, { ...(await loadNoticePrefs()), [key]: value });
}

interface Sent {
  /** reportIds already announced as confirmed. */
  confirmed: string[];
  /** proofHashes whose photo request was already announced. */
  requests: string[];
}

// ---- Reports: confirmed by the community, photo requested ---------------------------------------

export interface ReportNoticeDeps {
  fetchImpl?: typeof fetch;
  show?: (title: string, body: string) => Promise<void>;
  pendingRequests?: () => Promise<string[]>;
  identityStep?: boolean;
}

async function defaultShow(title: string, body: string): Promise<void> {
  const { showLocalNotice } = await import("./notifications");
  await showLocalNotice(title, body);
}

/** After a sync pass: announce what changed for this phone's own reports. Never throws. */
export async function runReportNotices(apiUrl: string, rows: LocalProof[], deps: ReportNoticeDeps = {}): Promise<void> {
  const show = deps.show ?? defaultShow;
  try {
    // Unreadable settings (a phone locked since restart) stop the run: never repeat a notice.
    const prefs = await readStrict(PREFS_KEY, DEFAULT_PREFS);
    const sent = await readStrict<Sent>(SENT_KEY, { confirmed: [], requests: [] });
    if (!prefs || !sent) return;
    let changed = false;

    if (prefs.photoRequests) {
      const mine = new Set(rows.map((r) => r.proofHash));
      const pending = (await (deps.pendingRequests ?? pendingEvidenceRequests)()).filter((h) => mine.has(h));
      const fresh = pending.filter((h) => !sent.requests.includes(h));
      if (fresh.length > 0) {
        sent.requests = [...sent.requests, ...fresh].slice(-500);
        changed = true;
        await show(
          "The programme team asked for a photo",
          "Open Prufture to choose whether to share it. Nothing is sent unless you approve.",
        ).catch(() => undefined);
      }
    }

    if (prefs.confirmations) {
      const identityStep = deps.identityStep ?? identityStepEnabled();
      // One sent proof per report, for assignments that ask for confirmations, newest first.
      const byReport = new Map<string, LocalProof>();
      for (const r of [...rows].sort((a, b) => b.capturedAt.localeCompare(a.capturedAt))) {
        if (r.status === PENDING || byReport.has(r.reportId) || sent.confirmed.includes(r.reportId)) continue;
        if (!getTask(r.taskId).confirmations) continue;
        byReport.set(r.reportId, r);
      }
      const newly: string[] = [];
      for (const [reportId, r] of [...byReport].slice(0, MAX_CONFIRMATION_CHECKS)) {
        const reports = await fetchConfirmations(apiUrl, r.proofHash, deps.fetchImpl);
        const live = reports ? liveConfirmations(getTask(r.taskId), reports, identityStep) : null;
        if (live && live.have >= live.need) newly.push(reportId);
      }
      if (newly.length > 0) {
        sent.confirmed = [...sent.confirmed, ...newly].slice(-500);
        changed = true;
        await show(
          "Confirmed by the community",
          newly.length > 1
            ? `${newly.length} of your reports now have enough nearby reports from programme members.`
            : "A report you sent now has enough nearby reports from programme members.",
        ).catch(() => undefined);
      }
    }

    if (changed) await writeJson(SENT_KEY, sent);
  } catch {
    // Notices are extras: a failure here never touches reporting.
  }
}

// ---- Nearby missions reminder ------------------------------------------------------------------

/** The weekly reminder text, or null when nothing is near. */
export function missionsReminder(nearCount: number): { title: string; body: string } | null {
  if (nearCount <= 0) return null;
  return {
    title: "Missions near you",
    body: `There ${nearCount === 1 ? "is 1 mission" : `are ${nearCount} missions`} near you. Open Prufture when you have a moment.`,
  };
}

export interface ReminderDeps {
  schedule?: (id: string, title: string, body: string) => Promise<void>;
  cancel?: (id: string) => Promise<void>;
}

/**
 * Keep one weekly reminder in line with what is near this phone now: replaced each time Missions
 * opens with a known area, cancelled when nothing is near or the switch is off. Never throws.
 */
export async function scheduleMissionsReminder(nearCount: number, deps: ReminderDeps = {}): Promise<void> {
  try {
    const n = await import("./notifications").catch(() => null);
    const cancel = deps.cancel ?? n?.cancelScheduledNotice;
    const schedule = deps.schedule ?? n?.scheduleWeeklyNotice;
    await cancel?.(MISSIONS_REMINDER_ID);
    const prefs = await loadNoticePrefs();
    const reminder = missionsReminder(nearCount);
    if (!prefs.missions || !reminder) return;
    await schedule?.(MISSIONS_REMINDER_ID, reminder.title, reminder.body);
  } catch {
    // A reminder that cannot be scheduled is simply not shown.
  }
}

// ---- Coordinator: new since the last visit -----------------------------------------------------

/** Reports captured after the last visit. The first visit has nothing "new". */
export function newSinceLastVisit(rows: { capturedAt: string }[], lastVisit: number | null): number {
  if (lastVisit === null) return 0;
  return rows.filter((r) => {
    const t = Date.parse(r.capturedAt);
    return Number.isFinite(t) && t > lastVisit;
  }).length;
}

export async function readLastCoordinatorVisit(): Promise<number | null> {
  const { at } = await readJson<{ at: number | null }>(COORDINATOR_VISIT_KEY, { at: null });
  return typeof at === "number" && Number.isFinite(at) ? at : null;
}

export async function writeLastCoordinatorVisit(at: number): Promise<void> {
  await writeJson(COORDINATOR_VISIT_KEY, { at });
}
