// personhood-inputs.test.ts: the on-device input builder matches what the JS Semaphore prover
// feeds the circuit (root, padding, hashes) for the fixture group, and refuses non-members.

import { test } from "node:test";
import assert from "node:assert/strict";
import { Identity } from "@semaphore-protocol/identity";
import { keccak256, toHex } from "viem";
import { buildCircuitInputs, CIRCUIT_DEPTH, semaphoreHash, toSemaphoreProof } from "../src/personhood-inputs";
import {
  BENCH_COMMITMENTS,
  BENCH_MESSAGE,
  BENCH_PRIVATE_KEY,
  BENCH_ROOT,
  BENCH_SCOPE,
} from "../src/zk-bench-fixture";

const id = new Identity(BENCH_PRIVATE_KEY);
const args = {
  secretScalar: id.secretScalar,
  commitment: id.commitment,
  commitments: BENCH_COMMITMENTS,
  message: BigInt(BENCH_MESSAGE),
  scope: BigInt(BENCH_SCOPE),
};

test("builds the fixture group's root and pads siblings to the circuit depth", () => {
  const { root, inputs } = buildCircuitInputs(args);
  assert.equal(root, BENCH_ROOT);
  assert.equal(inputs.merkleProofSiblings.length, CIRCUIT_DEPTH);
  assert.equal(inputs.merkleProofLength, 3);
  assert.equal(inputs.merkleProofIndex, 0);
  assert.equal(inputs.secret, id.secretScalar.toString());
});

test("semaphoreHash matches keccak256(32-byte BE) >> 8 computed independently", () => {
  for (const x of [0n, 1n, BigInt(BENCH_MESSAGE), BigInt(BENCH_SCOPE), 2n ** 256n - 1n]) {
    const ref = (BigInt(keccak256(toHex(x, { size: 32 }))) >> 8n).toString();
    assert.equal(semaphoreHash(x), ref);
  }
});

test("a non-member cannot build inputs", () => {
  assert.throws(() => buildCircuitInputs({ ...args, commitment: 12345n }), /not enrolled/);
});

test("toSemaphoreProof maps public signals and keeps raw message/scope", () => {
  const p = toSemaphoreProof({ points: ["1", "2", "3", "4", "5", "6", "7", "8"], publicSignals: ["r", "n", "m", "s"] }, 7n, 9n);
  assert.deepEqual(
    { root: p.merkleTreeRoot, nullifier: p.nullifier, message: p.message, scope: p.scope, depth: p.merkleTreeDepth },
    { root: "r", nullifier: "n", message: "7", scope: "9", depth: CIRCUIT_DEPTH },
  );
});
