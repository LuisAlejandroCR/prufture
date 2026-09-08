// queue-row.ts: pure mapping between a SignedProof and its SQLite row shape.
// Split out of queue.ts so the row invariants are testable without expo-sqlite.

import type { ProofStatus, QueuedProof, SignedProof } from "@proof/core";

/**
 * A queued proof plus the local-only `reportId` that groups the several per-photo
 * proofs of one field report. It is NOT part of the signed payload and is never
 * sent by sync.ts/toSignedProof — grouping is a device-side UX concern only.
 * "" for rows written before this column existed.
 */
export type LocalProof = QueuedProof & { reportId: string };

export const COLUMNS = [
  "id",
  "proofHash",
  "taskId",
  "geohash",
  "capturedAt",
  "signature",
  "publicKey",
  "status",
  "mediaUri",
  "attestationCount",
  "createdAt",
  "reportId",
] as const;

export interface ProofRow {
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
  reportId: string | null;
}

/** Build the freshly-queued proof. New captures are always `pending_sync`, count 0. */
export function buildQueueRow(
  signed: SignedProof,
  mediaUri: string,
  now: number = Date.now(),
  reportId = "",
): LocalProof {
  return {
    ...signed,
    id: `${signed.proofHash.slice(0, 12)}-${now}`,
    status: "pending_sync",
    mediaUri,
    attestationCount: 0,
    createdAt: new Date(now).toISOString(),
    reportId,
  };
}

export function toRow(p: LocalProof): ProofRow {
  return {
    id: p.id,
    proofHash: p.proofHash,
    taskId: p.taskId,
    geohash: p.geohash,
    capturedAt: p.capturedAt,
    signature: p.signature,
    publicKey: p.publicKey,
    status: p.status,
    mediaUri: p.mediaUri,
    attestationCount: p.attestationCount,
    createdAt: p.createdAt,
    reportId: p.reportId ?? "",
  };
}

export function fromRow(r: ProofRow): LocalProof {
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
    reportId: r.reportId ?? "",
  };
}

export function insertParams(row: LocalProof): unknown[] {
  const r = toRow(row) as unknown as Record<string, unknown>;
  return COLUMNS.map((c) => r[c]);
}
