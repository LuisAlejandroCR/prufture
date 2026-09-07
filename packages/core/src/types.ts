// types.ts: shared domain types for Proof-at-Capture.
// The public on-chain payload is exactly ProofPublicPayload — zero PII by construction.
// Distinct from result.ts (external-call envelope) and signature.ts (crypto).

/** State of a queued proof, shown to the volunteer. */
export type ProofStatus = "pending_sync" | "synced" | "attested";

/** The only fields that may ever leave the device or reach the chain. */
export interface ProofPublicPayload {
  /** sha256 of the captured media bytes, hex, no 0x prefix. */
  proofHash: string;
  /** Opaque field-task identifier, not tied to a person. */
  taskId: string;
  /** Geohash of the capture location — coarse, never exact lat/lng. */
  geohash: string;
  /** ISO-8601 UTC capture time. */
  capturedAt: string;
}

/** Public payload plus the device signature over it. Still zero PII. */
export interface SignedProof extends ProofPublicPayload {
  /** ed25519 signature over canonicalPayload(payload), hex. */
  signature: string;
  /** ed25519 public key of the capture device, hex. */
  publicKey: string;
}

/** Local queue row. `mediaUri` stays on-device and is never uploaded by default. */
export interface QueuedProof extends SignedProof {
  id: string;
  status: ProofStatus;
  mediaUri: string;
  attestationCount: number;
  createdAt: string;
}

/** Deterministic string signed on-device and re-derived by the backend. */
export function canonicalPayload(p: ProofPublicPayload): string {
  return [p.proofHash, p.taskId, p.geohash, p.capturedAt].join("|");
}
