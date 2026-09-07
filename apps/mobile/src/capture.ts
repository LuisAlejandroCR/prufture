// capture.ts: orchestrates one capture — read media + location, hash, sign, enqueue.
// TODO(block1): supply real bytes from expo-camera and real coords from expo-location.

import { hashBytes, signPayload, type ProofPublicPayload } from "@proof/core";
import { getOrCreatePrivateKey } from "./keystore";
import { enqueueProof } from "./queue";

export interface CaptureInput {
  taskId: string;
  /** Raw media bytes from the camera. Placeholder until block 1 wiring. */
  mediaBytes?: Uint8Array;
  /** Coarse geohash of the capture point. Placeholder until block 1 wiring. */
  geohash?: string;
  mediaUri?: string;
}

export async function captureProof(input: CaptureInput) {
  const bytes = input.mediaBytes ?? new Uint8Array([0]);
  const payload: ProofPublicPayload = {
    proofHash: hashBytes(bytes),
    taskId: input.taskId,
    geohash: input.geohash ?? "u000000",
    capturedAt: new Date().toISOString(),
  };
  const priv = await getOrCreatePrivateKey();
  const signed = signPayload(payload, priv);
  return enqueueProof(signed, input.mediaUri ?? "");
}
