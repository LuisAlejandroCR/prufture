// signature.test.ts: round-trip check for sign/verify and tamper rejection.

import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPair, signPayload, verifyProof } from "./signature.js";
import type { ProofPublicPayload } from "./types.js";

const payload: ProofPublicPayload = {
  proofHash: "a".repeat(64),
  taskId: "solar-panel-install",
  geohash: "u4pruyd",
  capturedAt: "2026-09-07T10:00:00.000Z",
};

test("valid signature verifies", () => {
  const kp = generateKeyPair();
  assert.equal(verifyProof(signPayload(payload, kp.privateKey)), true);
});

test("tampered payload fails", () => {
  const kp = generateKeyPair();
  const signed = signPayload(payload, kp.privateKey);
  assert.equal(verifyProof({ ...signed, taskId: "other" }), false);
});
