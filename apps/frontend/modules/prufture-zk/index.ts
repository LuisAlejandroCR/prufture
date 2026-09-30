// index.ts: JS face of the PruftureZk native module (iOS and Android). In Expo Go, on web, or in
// any build without the prover it resolves to null, and every caller degrades to "unavailable".

import { requireOptionalNativeModule } from "expo";

interface PruftureZkNative {
  treeDepth: number;
  prove(inputsJson: string): Promise<string>;
  verify(proofJson: string): Promise<boolean>;
}

const native = requireOptionalNativeModule<PruftureZkNative>("PruftureZk");

export interface RawSemaphoreProof {
  points: string[];
  /** [merkleTreeRoot, nullifier, hash(message), hash(scope)] */
  publicSignals: string[];
}

export function zkProverAvailable(): boolean {
  return native !== null;
}

export async function proveOnDevice(inputs: object): Promise<RawSemaphoreProof> {
  if (!native) throw new Error("on-device prover not in this build");
  return JSON.parse(await native.prove(JSON.stringify(inputs))) as RawSemaphoreProof;
}

export async function verifyOnDevice(proof: RawSemaphoreProof): Promise<boolean> {
  if (!native) throw new Error("on-device prover not in this build");
  return native.verify(JSON.stringify(proof));
}
