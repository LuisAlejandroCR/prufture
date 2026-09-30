// personhood-outcome.ts: the device-only record of each report's programme-pass check — one outcome
// per proof, which "unavailable" ones a later sync pass retries, the per-report summary and its plain
// copy. Pure and injectable (no react-native); records never leave the phone.

import type { PersonhoodOutcome } from "./personhood-proof";

export interface OutcomeRecord {
  proofHash: string;
  outcome: PersonhoodOutcome;
  /** Attempts started so far, including one still running. */
  attempts: number;
  /** ms epoch of the first attempt; bounds the retry window. */
  firstAttemptAt: number;
  updatedAt: number;
}

export interface OutcomeStorage {
  get: (proofHash: string) => Promise<OutcomeRecord | null>;
  list: () => Promise<OutcomeRecord[]>;
  put: (record: OutcomeRecord) => Promise<void>;
}

/** Retries stop after this many attempts per proof... */
export const MAX_ATTEMPTS = 5;
/** ...or once this long has passed since the first one. */
export const RETRY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

const OUTCOMES: readonly PersonhoodOutcome[] = ["verified", "invalid", "reused", "unavailable"];

/** A stored row back into a record, or null when it is not one this module wrote. */
export function toRecord(row: unknown): OutcomeRecord | null {
  const r = row as Partial<OutcomeRecord> | null;
  if (!r || typeof r.proofHash !== "string" || !OUTCOMES.includes(r.outcome as PersonhoodOutcome)) return null;
  const nums = [r.attempts, r.firstAttemptAt, r.updatedAt];
  if (!nums.every((n) => typeof n === "number" && Number.isFinite(n))) return null;
  return r as OutcomeRecord;
}

/**
 * Runs one attempt and records it. "unavailable" is written BEFORE the attempt, so an app closed
 * mid-proof leaves a row the next sync pass retries. Never throws; storage errors only lose the record.
 */
export async function recordAttempt(
  proofHash: string,
  storage: OutcomeStorage,
  attempt: () => Promise<PersonhoodOutcome>,
  now: () => number = Date.now,
): Promise<PersonhoodOutcome> {
  const prev = await storage.get(proofHash).catch(() => null);
  const started = now();
  const record: OutcomeRecord = {
    proofHash,
    outcome: "unavailable",
    attempts: (prev?.attempts ?? 0) + 1,
    firstAttemptAt: prev?.firstAttemptAt ?? started,
    updatedAt: started,
  };
  await storage.put(record).catch(() => undefined);
  const outcome = await attempt().catch((): PersonhoodOutcome => "unavailable");
  await storage.put({ ...record, outcome, updatedAt: now() }).catch(() => undefined);
  return outcome;
}

/** Whether an "unavailable" record may still be tried again. */
export function canRetry(record: OutcomeRecord, now: number): boolean {
  return (
    record.outcome === "unavailable" &&
    record.attempts < MAX_ATTEMPTS &&
    now - record.firstAttemptAt < RETRY_WINDOW_MS
  );
}

interface RowLike {
  proofHash: string;
  status: string;
  reportId?: string;
}

/**
 * Proof hashes a sync pass should try again, oldest row first. Only rows already on the api with a
 * recorded, still-retryable "unavailable". A row with no record is never picked: it was synced while
 * the pass was off, and proving it now would spend this round's pass on an old report. A row is
 * skipped once another photo of the same report is verified (it could only come back "reused").
 */
export function retryCandidates(rows: RowLike[], records: OutcomeRecord[], now: number): string[] {
  const byHash = new Map(records.map((r) => [r.proofHash, r]));
  const verifiedReports = new Set(
    rows.filter((r) => r.reportId && byHash.get(r.proofHash)?.outcome === "verified").map((r) => r.reportId),
  );
  return rows
    .filter((r) => r.status !== "pending_sync")
    .filter((r) => !(r.reportId && verifiedReports.has(r.reportId)))
    .filter((r) => {
      const rec = byHash.get(r.proofHash);
      return rec ? canRetry(rec, now) : false;
    })
    .map((r) => r.proofHash)
    .reverse();
}

/**
 * One programme pass per report. Every photo of a report shares the task's scope, so once one photo
 * is verified the others could only come back "reused". Session memory only; after a restart
 * retryCandidates skips verified reports the same way. A row without a reportId is its own report.
 */
export function createReportGate() {
  const verified = new Set<string>();
  return {
    shouldProve: (reportId?: string) => !reportId || !verified.has(reportId),
    record: (reportId: string | undefined, outcome: PersonhoodOutcome) => {
      if (reportId && outcome === "verified") verified.add(reportId);
    },
  };
}

export interface ReportPass {
  outcome: PersonhoodOutcome;
  /** "unavailable" only: true while a later sync pass will still try again. */
  retrying: boolean;
}

/**
 * One summary for a report's photos, or null when no check was ever attempted (the pass is off,
 * or the report predates it). Any verified photo makes the report verified; a check still being
 * retried outranks a final "invalid"; "reused" is shown only when nothing else applies.
 */
export function reportPass(records: OutcomeRecord[], now: number): ReportPass | null {
  if (records.length === 0) return null;
  const has = (o: PersonhoodOutcome) => records.some((r) => r.outcome === o);
  if (has("verified")) return { outcome: "verified", retrying: false };
  const retrying = records.some((r) => canRetry(r, now));
  if (retrying) return { outcome: "unavailable", retrying: true };
  if (has("invalid")) return { outcome: "invalid", retrying: false };
  if (has("reused")) return { outcome: "reused", retrying: false };
  return { outcome: "unavailable", retrying: false };
}

/** Plain-language status line. Says what was checked, nothing about how it is computed. */
export function reportPassCopy(pass: ReportPass): { title: string; body: string } {
  switch (pass.outcome) {
    case "verified":
      return {
        title: "Programme pass accepted",
        body: "The check showed this report came from someone enrolled in the programme. It did not send your pass code, name, phone number or location.",
      };
    case "invalid":
      return {
        title: "Programme pass not accepted",
        body: "The check did not pass for this report. The report itself is still saved and sent. If this keeps happening, ask your coordinator.",
      };
    case "reused":
      return {
        title: "Programme pass already used here",
        body: "Your pass was already used for this activity in this round, so it was not counted again. The report itself is still saved and sent.",
      };
    case "unavailable":
      return pass.retrying
        ? {
            title: "Programme pass not checked yet",
            body: "The check could not finish. Prufture will try again the next time the app syncs. If you have not joined the programme yet, see Programme pass on the Me tab.",
          }
        : {
            title: "Programme pass not checked",
            body: "The check could not finish after several tries, so Prufture stopped trying. The report itself is still saved and sent.",
          };
  }
}
