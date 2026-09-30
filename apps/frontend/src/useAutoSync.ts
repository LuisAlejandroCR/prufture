// useAutoSync.ts: binds the pure syncPending() to real deps and drains the queue on reconnect and
// app-foreground, then runs the sealed-evidence pass (src/evidence-share.ts). runPendingSync() shares
// one in-flight promise, so runs never overlap; src/sync.ts stays pure and native-free for unit tests.

import { useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { attachPersonhoodAfterSync } from "./personhood-device";
import { listProofs, markAttested, markSynced } from "./queue";
import { syncEvidence } from "./evidence-share";
import { evidenceTokenHashFor } from "./evidence-token";
import { PENDING_STATUS, syncPending, type SyncSummary } from "./sync";

// Expo inlines EXPO_PUBLIC_* at build time. Local-dev fallback only.
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8787";

/**
 * Treat the device as online unless connectivity is explicitly false. `isInternetReachable` is null
 * on the first NetInfo emit on some platforms; reading that null as offline meant auto-sync never
 * fired, even on Wi-Fi.
 */
export function isOnline(state: {
  isConnected: boolean | null;
  isInternetReachable: boolean | null;
}): boolean {
  return state.isConnected === true && state.isInternetReachable !== false;
}

let inFlight: Promise<SyncSummary> | null = null;

/** Bound, de-duplicated sync. Concurrent callers share the one in-flight run. */
export function runPendingSync(): Promise<SyncSummary> {
  if (inFlight) return inFlight;
  const fetchImpl = (input: RequestInfo | URL, init?: RequestInit) => fetch(input, init);
  inFlight = syncPending({
    fetchImpl,
    apiUrl: API_URL,
    listProofs,
    markSynced,
    markAttested,
    // Programme pass: a no-op unless EXPO_PUBLIC_PERSONHOOD_PROVIDER=semaphore and the prover is in
    // this build. Fire-and-forget; its outcome never changes the sync.
    onSynced: (row) => attachPersonhoodAfterSync(API_URL, row),
    evidenceTokenHash: evidenceTokenHashFor,
  })
    .then(async (summary) => {
      // After the proofs: post any sealed photos the reporter agreed to share, and look for
      // coordinator requests on proofs the api has. Best-effort; never changes the summary.
      const rows = await listProofs().catch(() => []);
      const onApi = rows.filter((r) => r.status !== PENDING_STATUS).map((r) => r.proofHash);
      await syncEvidence(API_URL, fetchImpl, onApi);
      return summary;
    })
    .finally(() => {
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
      const online = isOnline(state);
      if (online && !wasOnline) trigger();
      wasOnline = online;
    });

    const appSub = AppState.addEventListener("change", (next: AppStateStatus) => {
      if (next === "active") trigger();
    });

    // The queue may already hold rows and the app may open already-online mid-session,
    // with no rising edge and no foreground event to react to. Attempt once on mount.
    const initial = setTimeout(trigger, 800);

    return () => {
      cancelled = true;
      clearTimeout(initial);
      unsubNet();
      appSub.remove();
    };
  }, []);
}
