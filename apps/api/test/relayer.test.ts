// relayer.test.ts: exercises the EAS schema encoding and the degradation contract.
// It does not hit the chain — the real attest() tx is proven in docs/verification.md.

import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeAbiParameters, parseAbiParameters } from "viem";
import { encodeProofData, submitAttestation } from "../src/relayer.js";

const PARAMS = parseAbiParameters("bytes32 proofHash, string taskId, string geohash, uint64 capturedAt");

test("encodeProofData round-trips the zero-PII payload", () => {
  const payload = {
    proofHash: "b".repeat(64),
    taskId: "task-solar-01",
    geohash: "u4pruydqqvj",
    capturedAt: "2026-09-07T10:00:00.000Z",
  };
  const encoded = encodeProofData(payload);
  const [hash, taskId, geohash, capturedAt] = decodeAbiParameters(PARAMS, encoded);
  assert.equal(hash, `0x${"b".repeat(64)}`);
  assert.equal(taskId, "task-solar-01");
  assert.equal(geohash, "u4pruydqqvj");
  assert.equal(capturedAt, 1788775200n);
});

test("encodeProofData rejects a non-32-byte hash", () => {
  assert.throws(() =>
    encodeProofData({ proofHash: "abc", taskId: "t", geohash: "g", capturedAt: "2026-09-07T10:00:00Z" }),
  );
});

test("submitAttestation degrades (never throws) when the relayer is unconfigured", async () => {
  const res = await submitAttestation({
    proofHash: "c".repeat(64),
    taskId: "t",
    geohash: "g",
    capturedAt: "2026-09-07T10:00:00Z",
  });
  assert.equal(res.available, false);
  assert.equal(res.source, "relayer/eas");
});
