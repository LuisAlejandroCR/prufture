// useAutoSync.ts: binds the pure syncPending() to real deps and drains the queue on reconnect.
// runPendingSync() = the bound call (fetch + queue fns + EXPO_PUBLIC_API_URL); shared in-flight
// promise means no overlap. useAutoSync() fires it once on connectivity-restored and on
// app-foreground. Distinct from src/sync.ts, which stays pure and native-free for unit tests.

import { useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { listProofs, markAttested, markSynced } from "./queue";
import { syncPending, type SyncSummary } from "./sync";

// Expo inlines EXPO_PUBLIC_* at build time. Local-dev fallback only.
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8787";

let inFlight: Promise<SyncSummary> | null = null;

/** Bound, de-duplicated sync. Concurrent callers share the one in-flight run. */
export function runPendingSync(): Promise<SyncSummary> {
  if (inFlight) return inFlight;
  inFlight = syncPending({
    fetchImpl: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, init),
    apiUrl: API_URL,
    listProofs,
    markSynced,
    markAttested,
  }).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

/** Mount once (root layout). Optionally observe each auto-run's summary. */
export function useAutoSync(onDone?: (s: SyncSummary) => void): void {
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    let cancelled = false;
    const trigger = () => {
      runPendingSync()
        .then((s) => {
          if (!cancelled) onDoneRef.current?.(s);
        })
        .catch(() => {});
    };

    let wasOnline = false;
    const unsubNet = NetInfo.addEventListener((state) => {
      const online = Boolean(state.isConnected && state.isInternetReachable);
      if (online && !wasOnline) trigger();
      wasOnline = online;
    });

    const appSub = AppState.addEventListener("change", (next: AppStateStatus) => {
      if (next === "active") trigger();
    });

    return () => {
      cancelled = true;
      unsubNet();
      appSub.remove();
    };
  }, []);
}
