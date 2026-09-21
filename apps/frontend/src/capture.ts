// capture.ts: orchestrates one capture — hash real media bytes, sign the public payload, enqueue.
// No network here: hash + sign + SQLite insert all run offline. Distinct from queue.ts (storage).

import { coarsenGeohash, hashBytes, signPayload, type ProofPublicPayload } from "@proof/core";
import { base64ToBytes } from "./base64";
import { getOrCreatePrivateKey } from "./keystore";
import { enqueueProof } from "./queue";

export { base64ToBytes };

export interface CaptureInput {
  taskId: string;
  /** Raw photo bytes read from the camera file via expo-file-system. */
  mediaBytes: Uint8Array;
  /** Geohash of the capture point. Coarsened to 5 chars here before signing, whatever
   *  precision the caller passed — never exact lat/lng. */
  geohash: string;
  /** On-device file URI of the photo. Stays local, never uploaded by default. */
  mediaUri: string;
  /**
   * Local-only id grouping the per-photo proofs of one field report. Never signed,
   * never sent. "" when a single capture is not part of a multi-photo draft.
   */
  reportId?: string;
}

export async function captureProof(input: CaptureInput) {
  const payload: ProofPublicPayload = {
    proofHash: hashBytes(input.mediaBytes),
    taskId: input.taskId,
    // Coarsen BEFORE signing: the signed payload is what reaches the chain, so a finer
    // cell trimmed later would still be on-chain. This is the only place that decides.
    geohash: coarsenGeohash(input.geohash),
    capturedAt: new Date().toISOString(),
  };
  const priv = await getOrCreatePrivateKey();
  const signed = signPayload(payload, priv);
  return enqueueProof(signed, input.mediaUri, input.reportId ?? "");
}
