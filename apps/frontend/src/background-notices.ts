// background-notices.ts: runs the local notices (src/local-notices.ts) while the app is closed, when
// iOS or Android wakes it through expo-background-task. Same checks as after a sync, nothing new
// leaves the phone, and it does not upload reports. The system decides when it runs: iOS often waits
// for overnight charging, so a notice can still come late. Native modules are injected or
// lazy-imported, so this file tests under node; the task itself is defined in
// background-task-define.ts, which must load at startup.

import { loadNoticePrefs, runReportNotices } from "./local-notices";
import type { LocalProof } from "./queue-row";

export const BACKGROUND_NOTICES_TASK = "prufture-local-notices";
/** Minutes between runs at the earliest. The system treats it as a floor, not a schedule. */
export const BACKGROUND_INTERVAL_MIN = 6 * 60;

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8787";

export interface BackgroundRunDeps {
  listProofs?: () => Promise<LocalProof[]>;
  notices?: (apiUrl: string, rows: LocalProof[]) => Promise<void>;
}

/** One background run. Never throws. */
export async function runBackgroundNotices(deps: BackgroundRunDeps = {}): Promise<"success" | "failed"> {
  try {
    const listProofs = deps.listProofs ?? (await import("./queue")).listProofs;
    const rows = await listProofs();
    await (deps.notices ?? runReportNotices)(API_URL, rows);
    return "success";
  } catch {
    return "failed";
  }
}

export interface RegisterDeps {
  /** BackgroundTaskStatus: 1 restricted, 2 available. */
  status?: () => Promise<number>;
  register?: (name: string, options: { minimumInterval: number }) => Promise<void>;
  unregister?: (name: string) => Promise<void>;
  isRegistered?: (name: string) => Promise<boolean>;
}

/**
 * Keep the task registered only while a notice that needs it is on (confirmations or photo requests;
 * the missions reminder is a scheduled local notification and needs no background run). Never throws.
 */
export async function registerBackgroundNotices(deps: RegisterDeps = {}): Promise<void> {
  try {
    const BackgroundTask = deps.register && deps.unregister && deps.status ? null : await import("expo-background-task");
    const TaskManager = deps.isRegistered ? null : await import("expo-task-manager");
    const status = deps.status ?? BackgroundTask!.getStatusAsync;
    const register = deps.register ?? BackgroundTask!.registerTaskAsync;
    const unregister = deps.unregister ?? BackgroundTask!.unregisterTaskAsync;
    const isRegistered = deps.isRegistered ?? TaskManager!.isTaskRegisteredAsync;

    const prefs = await loadNoticePrefs();
    const wanted = prefs.confirmations || prefs.photoRequests;
    const registered = await isRegistered(BACKGROUND_NOTICES_TASK);
    if (!wanted) {
      if (registered) await unregister(BACKGROUND_NOTICES_TASK);
      return;
    }
    if ((await status()) !== 2) return; // restricted: Low Power Mode, Background App Refresh off
    if (!registered) await register(BACKGROUND_NOTICES_TASK, { minimumInterval: BACKGROUND_INTERVAL_MIN });
  } catch {
    // Not in this build (Expo Go) or refused by the system: notices still run when the app opens.
  }
}
