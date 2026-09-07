// capture.ts: orchestrates one capture — hash real media bytes, sign the public payload, enqueue.
// No network here: hash + sign + SQLite insert all run offline. Distinct from queue.ts (storage).

import { hashBytes, signPayload, type ProofPublicPayload } from "@proof/core";
import { base64ToBytes } from "./base64";
import { getOrCreatePrivateKey } from "./keystore";
import { enqueueProof } from "./queue";

export { base64ToBytes };

export interface CaptureInput {
  taskId: string;
  /** Raw photo bytes read from the camera file via expo-file-system. */
  mediaBytes: Uint8Array;
  /** Coarse geohash (~5 chars) of the capture point — never exact lat/lng. */
  geohash: string;
  /** On-device file URI of the photo. Stays local, never uploaded by default. */
  mediaUri: string;
}

export async function captureProof(input: CaptureInput) {
  const payload: ProofPublicPayload = {
    proofHash: hashBytes(input.mediaBytes),
    taskId: input.taskId,
    geohash: input.geohash,
    capturedAt: new Date().toISOString(),
  };
  const priv = await getOrCreatePrivateKey();
  const signed = signPayload(payload, priv);
  return enqueueProof(signed, input.mediaUri);
}
