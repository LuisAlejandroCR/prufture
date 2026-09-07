// store.ts: in-memory attestation index, keyed by proofHash. Swap for a real DB in block 4.
// Holds only the zero-PII public payload plus attestation records.

import type { ProofPublicPayload } from "@proof/core";

export interface AttestationRecord {
  attester: string;
  txHash: string;
  attestedAt: string;
}

/** A verified attribute recorded against a proof. Boolean only — zero PII by construction. */
export interface VerifiedAttributeRecord {
  attribute: string;
  value: boolean;
  checkedAt: string;
}

interface Entry {
  payload: ProofPublicPayload;
  attestations: AttestationRecord[];
  verifiedAttribute?: VerifiedAttributeRecord;
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

/** Record a verified attribute against a proof. Only the boolean + name + timestamp are kept. */
export function setVerifiedAttribute(proofHash: string, rec: VerifiedAttributeRecord): boolean {
  const entry = byHash.get(proofHash);
  if (!entry) return false;
  entry.verifiedAttribute = { attribute: rec.attribute, value: rec.value, checkedAt: rec.checkedAt };
  return true;
}

export function getProof(proofHash: string): Entry | undefined {
  return byHash.get(proofHash);
}

export function allProofs(): Entry[] {
  return [...byHash.values()];
}
