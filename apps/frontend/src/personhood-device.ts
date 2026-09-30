// personhood-device.ts: binds the pure programme-pass modules to the device: seal key in
// expo-secure-store, sealed identity and per-proof outcomes in expo-sqlite, the PruftureZk prover, a
// post-sync hook and a retry pass that prove one report at a time in the background. Off (no work at
// all) unless the flag is on.

import * as SecureStore from "expo-secure-store";
import * as SQLite from "expo-sqlite";
import type { QueuedProof } from "@proof/core";
import { proveOnDevice, zkProverAvailable } from "../modules/prufture-zk";
import { personhoodProgrammeId, personhoodProvider } from "./flags";
import { createPersonhoodIdentity, type IdentityStorage } from "./personhood-identity";
import {
  createReportGate,
  recordAttempt,
  retryCandidates,
  toRecord,
  type OutcomeRecord,
  type OutcomeStorage,
} from "./personhood-outcome";
import {
  attachPersonhoodProof,
  checkEnrolment,
  personhoodActive,
  type Enrolment,
  type PersonhoodOutcome,
} from "./personhood-proof";

const SEAL_KEY = "proof.personhood.sealkey";
const DB_NAME = "personhood.db";

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync(DB_NAME);
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS personhood_identity (
          id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
          cipher TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS personhood_outcome (
          proofHash TEXT PRIMARY KEY NOT NULL,
          outcome TEXT NOT NULL,
          attempts INTEGER NOT NULL,
          firstAttemptAt INTEGER NOT NULL,
          updatedAt INTEGER NOT NULL
        );
      `);
      return db;
    })();
    dbPromise.catch(() => {
      dbPromise = null;
    });
  }
  return dbPromise;
}

const storage: IdentityStorage = {
  getKey: () => SecureStore.getItemAsync(SEAL_KEY),
  setKey: (keyHex) =>
    SecureStore.setItemAsync(SEAL_KEY, keyHex, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    }),
  getCipher: async () => {
    const row = await (await getDb()).getFirstAsync<{ cipher: string }>(
      `SELECT cipher FROM personhood_identity WHERE id = 1`,
    );
    return row?.cipher ?? null;
  },
  setCipher: async (cipherHex) => {
    await (await getDb()).runAsync(
      `INSERT INTO personhood_identity (id, cipher) VALUES (1, ?)
       ON CONFLICT(id) DO UPDATE SET cipher = excluded.cipher`,
      [cipherHex],
    );
  },
};

const identity = createPersonhoodIdentity(storage);

// Device-only: which reports passed the check. Never part of /sync or any other request.
const outcomes: OutcomeStorage = {
  get: async (proofHash) =>
    toRecord(
      await (await getDb()).getFirstAsync<OutcomeRecord>(`SELECT * FROM personhood_outcome WHERE proofHash = ?`, [
        proofHash,
      ]),
    ),
  list: async () =>
    (await (await getDb()).getAllAsync<OutcomeRecord>(`SELECT * FROM personhood_outcome`))
      .map(toRecord)
      .filter((r): r is OutcomeRecord => r !== null),
  put: async (r) => {
    await (await getDb()).runAsync(
      `INSERT INTO personhood_outcome (proofHash, outcome, attempts, firstAttemptAt, updatedAt)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(proofHash) DO UPDATE SET outcome = excluded.outcome, attempts = excluded.attempts,
         firstAttemptAt = excluded.firstAttemptAt, updatedAt = excluded.updatedAt`,
      [r.proofHash, r.outcome, r.attempts, r.firstAttemptAt, r.updatedAt],
    );
  },
};

/** Stored outcomes for these proofs (the status screen). Empty when nothing was ever attempted. */
export async function getOutcomes(proofHashes: string[]): Promise<OutcomeRecord[]> {
  const wanted = new Set(proofHashes);
  return (await outcomes.list()).filter((r) => wanted.has(r.proofHash));
}

/** The commitment a coordinator enrols (public; reveals no secret). */
export function getCommitment(): Promise<string> {
  return identity.getCommitment();
}

/** True when this build will attempt a programme pass after sync. */
export function personhoodOn(): boolean {
  return personhoodActive(personhoodProvider(), zkProverAvailable());
}

/** Whether this phone's code is on the programme list. "unknown" offline or when the pass is off. */
export async function getEnrolment(apiUrl: string): Promise<Enrolment> {
  if (personhoodProvider() !== "semaphore") return "unknown";
  const commitment = await identity.getCommitment().catch(() => "");
  return checkEnrolment(apiUrl, personhoodProgrammeId(), commitment, (input, init) => fetch(input, init));
}

// One proof at a time: proving is CPU-heavy, and sync can accept several rows in one pass.
let chain: Promise<unknown> = Promise.resolve();
// Queued or running, so the retry pass never schedules a proof the post-sync hook already has.
const scheduled = new Set<string>();
// Checked when the proof's turn comes, so a photo queued behind its verified sibling is skipped
// without a record (it would only come back "reused"); the report already shows as accepted.
const reports = createReportGate();

type ProvableRow = { proofHash: string; taskId: string; reportId?: string };

function schedule(apiUrl: string, row: ProvableRow): Promise<PersonhoodOutcome> {
  scheduled.add(row.proofHash);
  const run = chain
    .then(async (): Promise<PersonhoodOutcome> => {
      if (!reports.shouldProve(row.reportId)) return "verified";
      const outcome = await recordAttempt(row.proofHash, outcomes, () =>
        attachPersonhoodProof(
          { proofHash: row.proofHash, taskId: row.taskId, programmeId: personhoodProgrammeId() },
          {
            fetchImpl: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, init),
            apiUrl,
            provider: personhoodProvider,
            proverAvailable: zkProverAvailable,
            prove: proveOnDevice,
            getIdentity: identity.getIdentity,
          },
        ),
      );
      reports.record(row.reportId, outcome);
      return outcome;
    })
    .finally(() => scheduled.delete(row.proofHash));
  chain = run.catch(() => undefined);
  return run;
}

/**
 * SyncDeps.onSynced. Returns immediately; the proof runs after any earlier one finishes. The row comes
 * from listProofs, so it carries the local reportId that groups a report's photos.
 */
export function attachPersonhoodAfterSync(
  apiUrl: string,
  row: QueuedProof & { reportId?: string },
): Promise<PersonhoodOutcome> {
  if (!personhoodOn() || scheduled.has(row.proofHash)) return Promise.resolve("unavailable");
  return schedule(apiUrl, row);
}

/**
 * After a sync pass: try again every report whose check was recorded "unavailable" and is still
 * inside the retry limits (src/personhood-outcome.ts). Never throws; returns how many were queued.
 */
export async function retryPersonhood(
  apiUrl: string,
  rows: { proofHash: string; taskId: string; status: string; reportId?: string }[],
): Promise<number> {
  if (!personhoodOn()) return 0;
  try {
    const records = await outcomes.list();
    const byHash = new Map(rows.map((r) => [r.proofHash, r]));
    let queued = 0;
    for (const hash of retryCandidates(rows, records, Date.now())) {
      const row = byHash.get(hash);
      if (!row || scheduled.has(hash)) continue;
      schedule(apiUrl, row).catch(() => undefined);
      queued += 1;
    }
    return queued;
  } catch {
    return 0;
  }
}
