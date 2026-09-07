// queue.ts: offline proof queue on expo-sqlite. States: pending_sync -> synced -> attested.
// TODO(block1): replace the in-memory fallback with a real SQLite table + migrations.

import type { QueuedProof, SignedProof } from "@proof/core";

const memory: QueuedProof[] = [];

export async function enqueueProof(signed: SignedProof, mediaUri: string): Promise<QueuedProof> {
  const row: QueuedProof = {
    ...signed,
    id: `${signed.proofHash.slice(0, 12)}-${Date.now()}`,
    status: "pending_sync",
    mediaUri,
    attestationCount: 0,
    createdAt: new Date().toISOString(),
  };
  memory.unshift(row);
  return row;
}

export async function listProofs(): Promise<QueuedProof[]> {
  return [...memory];
}

export async function markSynced(id: string): Promise<void> {
  const row = memory.find((p) => p.id === id);
  if (row) row.status = "synced";
}
