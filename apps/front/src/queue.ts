// queue.ts: offline proof queue on expo-sqlite. States: pending_sync -> synced -> attested.
// The table is created on first open (migration). Every capture lands here before any network.
// Distinct from capture.ts (builds the signed proof) — this only persists and reads it.

import * as SQLite from "expo-sqlite";
import type { ProofStatus, QueuedProof, SignedProof } from "@proof/core";

const DB_NAME = "proofs.db";

interface Row {
  id: string;
  proofHash: string;
  taskId: string;
  geohash: string;
  capturedAt: string;
  signature: string;
  publicKey: string;
  status: string;
  mediaUri: string;
  attestationCount: number;
  createdAt: string;
}

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

function toProof(r: Row): QueuedProof {
  return {
    id: r.id,
    proofHash: r.proofHash,
    taskId: r.taskId,
    geohash: r.geohash,
    capturedAt: r.capturedAt,
    signature: r.signature,
    publicKey: r.publicKey,
    status: r.status as ProofStatus,
    mediaUri: r.mediaUri,
    attestationCount: r.attestationCount,
    createdAt: r.createdAt,
  };
}

export async function enqueueProof(signed: SignedProof, mediaUri: string): Promise<QueuedProof> {
  const db = await getDb();
  const row: QueuedProof = {
    ...signed,
    id: `${signed.proofHash.slice(0, 12)}-${Date.now()}`,
    status: "pending_sync",
    mediaUri,
    attestationCount: 0,
    createdAt: new Date().toISOString(),
  };
  await db.runAsync(
    `INSERT INTO proofs
       (id, proofHash, taskId, geohash, capturedAt, signature, publicKey, status, mediaUri, attestationCount, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.id,
      row.proofHash,
      row.taskId,
      row.geohash,
      row.capturedAt,
      row.signature,
      row.publicKey,
      row.status,
      row.mediaUri,
      row.attestationCount,
      row.createdAt,
    ],
  );
  return row;
}

export async function listProofs(): Promise<QueuedProof[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Row>(`SELECT * FROM proofs ORDER BY createdAt DESC`);
  return rows.map(toProof);
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
