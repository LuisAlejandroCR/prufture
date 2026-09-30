// evidence-token.test.ts: the per-proof evidence token is deterministic per device secret and proof,
// differs across proofs and devices, hashes the same way the api does, and degrades to null (never a
// throw) when the secret store is unavailable or the proofHash is malformed.

import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  __setEvidenceSecretSource,
  deriveEvidenceToken,
  evidenceTokenFor,
  evidenceTokenHashFor,
  hashEvidenceToken,
} from "../src/evidence-token.js";

const A = "a1".repeat(32);
const B = "b2".repeat(32);
const H1 = "1".repeat(64);
const H2 = "2".repeat(64);

afterEach(() => __setEvidenceSecretSource(null));

test("deterministic per (secret, proof); different across proofs and devices", () => {
  const t = deriveEvidenceToken(A, H1);
  assert.match(t, /^[0-9a-f]{64}$/);
  assert.equal(deriveEvidenceToken(A, H1), t);
  assert.notEqual(deriveEvidenceToken(A, H2), t);
  assert.notEqual(deriveEvidenceToken(B, H1), t);
  assert.notEqual(t, H1, "the token is not the public proofHash");
});

test("the token hash matches the api's sha256 over the token string", () => {
  const t = deriveEvidenceToken(A, H1);
  assert.equal(hashEvidenceToken(t), createHash("sha256").update(t, "utf8").digest("hex"));
});

test("evidenceTokenFor / evidenceTokenHashFor use the device secret and never throw", async () => {
  __setEvidenceSecretSource(async () => A);
  assert.equal(await evidenceTokenFor(H1), deriveEvidenceToken(A, H1));
  assert.equal(await evidenceTokenHashFor(H1), hashEvidenceToken(deriveEvidenceToken(A, H1)));
  assert.equal(await evidenceTokenFor("not-a-hash"), null);

  __setEvidenceSecretSource(async () => null);
  assert.equal(await evidenceTokenFor(H1), null);
  assert.equal(await evidenceTokenHashFor(H1), null);

  __setEvidenceSecretSource(async () => {
    throw new Error("keychain locked");
  });
  assert.equal(await evidenceTokenFor(H1), null);

  __setEvidenceSecretSource(async () => "short");
  assert.equal(await evidenceTokenFor(H1), null);
});
