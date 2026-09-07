// queue.ts: offline proof queue on expo-sqlite. States: pending_sync -> synced -> attested.
// The table is created on first open (migration). Every capture lands here before any network.
// Row<->proof mapping lives in queue-row.ts so it stays unit-testable off-device.

import * as SQLite from "expo-sqlite";
import type { QueuedProof, SignedProof } from "@proof/core";
import { buildQueueRow, COLUMNS, fromRow, insertParams, type ProofRow } from "./queue-row";

const DB_NAME = "proofs.db";

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync(DB_NAME);
      await db.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS proofs (
          id TEXT PRIMARY KEY NOT NULL,
          proofHash TEXT NOT NULL,
          taskId TEXT NOT NULL,
          geohash TEXT NOT NULL,
          capturedAt TEXT NOT NULL,
          signature TEXT NOT NULL,
          publicKey TEXT NOT NULL,
          status TEXT NOT NULL,
          mediaUri TEXT NOT NULL,
          attestationCount INTEGER NOT NULL DEFAULT 0,
          createdAt TEXT NOT NULL
        );
      `);
      return db;
    })();
  }
  return dbPromise;
}

export async function enqueueProof(signed: SignedProof, mediaUri: string): Promise<QueuedProof> {
  const db = await getDb();
  const row = buildQueueRow(signed, mediaUri);
  await db.runAsync(
    `INSERT INTO proofs (${COLUMNS.join(", ")}) VALUES (${COLUMNS.map(() => "?").join(", ")})`,
    insertParams(row) as SQLite.SQLiteBindValue[],
  );
  return row;
}

export async function listProofs(): Promise<QueuedProof[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<ProofRow>(`SELECT * FROM proofs ORDER BY createdAt DESC`);
  return rows.map(fromRow);
}

export async function markSynced(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(`UPDATE proofs SET status = 'synced' WHERE id = ?`, [id]);
}

export async function markAttested(id: string, attestationCount: number): Promise<void> {
  const db = await getDb();
  await db.runAsync(`UPDATE proofs SET status = 'attested', attestationCount = ? WHERE id = ?`, [
    attestationCount,
    id,
  ]);
}
