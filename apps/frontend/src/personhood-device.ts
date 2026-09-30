// personhood-device.ts: binds the pure programme-pass modules to the device: seal key in
// expo-secure-store, sealed identity in expo-sqlite, the PruftureZk prover, and a post-sync hook
// that proves one report at a time in the background. Off (no work at all) unless the flag is on.

import * as SecureStore from "expo-secure-store";
import * as SQLite from "expo-sqlite";
import type { QueuedProof } from "@proof/core";
import { proveOnDevice, zkProverAvailable } from "../modules/prufture-zk";
import { personhoodProgrammeId, personhoodProvider } from "./flags";
import { createPersonhoodIdentity, type IdentityStorage } from "./personhood-identity";
import { attachPersonhoodProof, personhoodActive, type PersonhoodOutcome } from "./personhood-proof";

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

/** The commitment a coordinator enrols (public; reveals no secret). */
export function getCommitment(): Promise<string> {
  return identity.getCommitment();
}

/** True when this build will attempt a programme pass after sync. */
export function personhoodOn(): boolean {
  return personhoodActive(personhoodProvider(), zkProverAvailable());
}

// One proof at a time: proving is CPU-heavy, and sync can accept several rows in one pass.
let chain: Promise<unknown> = Promise.resolve();

/** SyncDeps.onSynced. Returns immediately; the proof runs after any earlier one finishes. */
export function attachPersonhoodAfterSync(apiUrl: string, row: QueuedProof): Promise<PersonhoodOutcome> {
  if (!personhoodOn()) return Promise.resolve("unavailable");
  const run = chain.then(() =>
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
  chain = run.catch(() => undefined);
  return run;
}
