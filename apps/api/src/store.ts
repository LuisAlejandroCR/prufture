// store.ts: in-memory attestation index, keyed by proofHash. Swap for a real DB in block 4.
// Holds only the zero-PII public payload plus attestation records.

import type { ProofPublicPayload } from "@proof/core";

export interface AttestationRecord {
  attester: string;
  txHash: string;
  attestedAt: string;
}

interface Entry {
  payload: ProofPublicPayload;
  attestations: AttestationRecord[];
}

const byHash = new Map<string, Entry>();

export function upsertProof(payload: ProofPublicPayload): void {
  if (!byHash.has(payload.proofHash)) byHash.set(payload.proofHash, { payload, attestations: [] });
}

export function addAttestation(proofHash: string, rec: AttestationRecord): void {
  const entry = byHash.get(proofHash);
  if (entry && !entry.attestations.some((a) => a.attester === rec.attester)) {
    entry.attestations.push(rec);
  }
}

export function getProof(proofHash: string): Entry | undefined {
  return byHash.get(proofHash);
}

export function allProofs(): Entry[] {
  return [...byHash.values()];
}
