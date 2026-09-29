// personhood-inputs.ts: builds the Semaphore v4 circuit inputs on the device, exactly as
// @semaphore-protocol/proof does, for the native Rust prover (modules/prufture-zk). Pure TS, no
// react-native import. The secret scalar goes only into the returned object for the prover.

import { Group } from "@semaphore-protocol/group";
import { keccak_256 } from "@noble/hashes/sha3";
import { bytesToHex } from "@noble/hashes/utils";

/** Depth the bundled zkey was compiled for (1,024 members). Must match packages/zk-prover. */
export const CIRCUIT_DEPTH = 10;

/** Semaphore's field hash for message and scope: keccak256 of the 32-byte big-endian value, >> 8. */
export function semaphoreHash(x: bigint): string {
  const bytes = new Uint8Array(32);
  let v = x;
  for (let i = 31; i >= 0; i -= 1) {
    bytes[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return (BigInt(`0x${bytesToHex(keccak_256(bytes))}`) >> 8n).toString();
}

export interface CircuitInputs {
  secret: string;
  merkleProofLength: number;
  merkleProofIndex: number;
  merkleProofSiblings: string[];
  scope: string;
  message: string;
}

export interface BuildArgs {
  secretScalar: bigint;
  commitment: bigint;
  /** The programme group's commitments, in enrolment order (as the api returns them). */
  commitments: readonly string[];
  /** The report's proofHash as a number. */
  message: bigint;
  /** expectedScope() for (programme, task, epoch, policy). */
  scope: bigint;
}

export function buildCircuitInputs(a: BuildArgs): { inputs: CircuitInputs; root: string } {
  const group = new Group(a.commitments.map((c) => BigInt(c)));
  const index = group.indexOf(a.commitment);
  if (index < 0) throw new Error("not enrolled in this programme");
  const proof = group.generateMerkleProof(index);
  if (proof.siblings.length > CIRCUIT_DEPTH) throw new Error("group is larger than this build supports");
  const siblings = proof.siblings.map((s) => s.toString());
  while (siblings.length < CIRCUIT_DEPTH) siblings.push("0");
  return {
    root: proof.root.toString(),
    inputs: {
      secret: a.secretScalar.toString(),
      merkleProofLength: proof.siblings.length,
      merkleProofIndex: proof.index,
      merkleProofSiblings: siblings,
      scope: semaphoreHash(a.scope),
      message: semaphoreHash(a.message),
    },
  };
}

/** The proof object the api's /personhood/proof expects, from the prover's raw output. */
export function toSemaphoreProof(
  raw: { points: string[]; publicSignals: string[] },
  message: bigint,
  scope: bigint,
) {
  return {
    merkleTreeDepth: CIRCUIT_DEPTH,
    merkleTreeRoot: raw.publicSignals[0],
    nullifier: raw.publicSignals[1],
    message: message.toString(),
    scope: scope.toString(),
    points: raw.points,
  };
}
