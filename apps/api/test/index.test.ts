// index.test.ts: unit + fuzz + invariant tests for the block-4 HTTP wiring —
// /attest double-count guard, /notify validation, and the zero-PII shape of /proof + /proofs.

import { test } from "node:test";
import assert from "node:assert/strict";
import { signPayload, generateKeyPair } from "@proof/core";
import { app } from "../src/index.js";
import { addAttestation, getProof, upsertProof } from "../src/store.js";

const kp = generateKeyPair();
const call = (path: string, body: unknown) =>
  app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

function payload(hash: string, geohash = "9q8yy") {
  return { proofHash: hash, taskId: "solar-panel-installation", geohash, capturedAt: "2026-09-06T14:32:00.000Z" };
}

test("/sync degrades to synced (relayer unconfigured) and keeps status 200", async () => {
  const res = await call("/sync", signPayload(payload("a".repeat(64)), kp.privateKey));
  assert.equal(res.status, 200);
  const j = (await res.json()) as { status: string; attestation: { available: boolean } };
  assert.equal(j.status, "synced");
  assert.equal(j.attestation.available, false);
});

test("/sync rejects a tampered payload", async () => {
  const bad = signPayload(payload("c".repeat(64)), kp.privateKey);
  bad.taskId = "tampered";
  const res = await call("/sync", bad);
  assert.equal(res.status, 400);
});

test("/attest on a degraded relayer returns synced + current count, never throws", async () => {
  await call("/sync", signPayload(payload("d".repeat(64)), kp.privateKey));
  const res = await call("/attest", { proofHash: "d".repeat(64) });
  assert.equal(res.status, 200);
  const j = (await res.json()) as { status: string; attestationCount: number };
  assert.equal(j.status, "synced");
  assert.equal(j.attestationCount, 0);
});

test("/attest unknown proofHash → 404; /notify unknown proofHash → 404, unknown channel → 400", async () => {
  assert.equal((await call("/attest", { proofHash: "f".repeat(64) })).status, 404);
  assert.equal((await call("/notify", { proofHash: "f".repeat(64), channel: "email", to: "x" })).status, 404);
  await call("/sync", signPayload(payload("e".repeat(64)), kp.privateKey));
  assert.equal((await call("/notify", { proofHash: "e".repeat(64), channel: "smoke", to: "x" })).status, 400);
  assert.equal((await call("/notify", { proofHash: "e".repeat(64), channel: "email", to: "" })).status, 400);
});

test("invariant: double-count guard — same attester never increments the count", () => {
  upsertProof(payload("1".repeat(64)));
  for (let i = 0; i < 50; i++) {
    addAttestation("1".repeat(64), { attester: "0xAAA", txHash: "0x" + i, attestedAt: String(i) });
  }
  assert.equal(getProof("1".repeat(64))!.attestations.length, 1);
  addAttestation("1".repeat(64), { attester: "0xBBB", txHash: "0xff", attestedAt: "later" });
  assert.equal(getProof("1".repeat(64))!.attestations.length, 2);
});

test("fuzz: distinct attesters count once each; order and volume do not matter", () => {
  upsertProof(payload("2".repeat(64)));
  const attesters = Array.from({ length: 8 }, (_, i) => `0x${i}`);
  for (let i = 0; i < 300; i++) {
    const a = attesters[Math.floor(Math.random() * attesters.length)]!;
    addAttestation("2".repeat(64), { attester: a, txHash: "0x" + i, attestedAt: String(i) });
  }
  assert.equal(getProof("2".repeat(64))!.attestations.length, attesters.length);
});

test("/sync rejects a geohash finer than the coarse cell, so the chain never sees one", async () => {
  const res = await call("/sync", signPayload(payload("7".repeat(64), "9q8yyk8yuvxx"), kp.privateKey));
  assert.equal(res.status, 400);
  const j = (await res.json()) as { error: string; maxLength: number };
  assert.equal(j.error, "geohash too precise");
  assert.equal(j.maxLength, 5);
  assert.equal(getProof("7".repeat(64)), undefined, "a rejected proof must not be stored");
});

test("invariant: /proof and /proofs expose only a coarse region, never the full geohash", async () => {
  // Written straight to the store, bypassing /sync: this is a legacy entry from before the
  // precision check existed. The read path must still coarsen it.
  const full = "9q8yyk8yuvxx";
  upsertProof(payload("3".repeat(64), full));

  const one = await (await app.request("/proof/" + "3".repeat(64))).json() as Record<string, unknown>;
  assert.equal(one.geohashRegion, full.slice(0, 5));
  assert.ok(!("geohash" in one), "raw geohash must not be present on /proof");
  assert.ok(!JSON.stringify(one).includes(full), "full geohash must never appear");

  const list = await (await app.request("/proofs")).json() as Record<string, unknown>[];
  for (const row of list) {
    assert.ok(!("geohash" in row));
    assert.ok(String(row.geohashRegion ?? "").length <= 5);
  }
  assert.ok(!JSON.stringify(list).includes(full));
});

test("/verify-identity: unknown proofHash => 404", async () => {
  assert.equal((await call("/verify-identity", { proofHash: "b".repeat(64) })).status, 404);
});

test("/verify-identity: Neuro unconfigured => 200 degraded, proof unchanged, no verifiedAttribute", async () => {
  const hash = "7".repeat(64);
  await call("/sync", signPayload(payload(hash), kp.privateKey));
  const res = await call("/verify-identity", { proofHash: hash, attribute: "age_majority" });
  assert.equal(res.status, 200);
  const j = (await res.json()) as { status: string; verifiedAttribute: unknown; result: { available: boolean } };
  assert.equal(j.status, "degraded");
  assert.equal(j.verifiedAttribute, null);
  assert.equal(j.result.available, false);

  const proof = (await (await app.request("/proof/" + hash)).json()) as { verifiedAttribute: unknown };
  assert.equal(proof.verifiedAttribute, null);
});

test("invariant: /proof never serializes an identity field even after a verified attribute is set", async () => {
  const hash = "8".repeat(64);
  await call("/sync", signPayload(payload(hash), kp.privateKey));
  // Simulate an available result by writing straight to the store (Neuro stays BLOCKED in CI).
  const { setVerifiedAttribute } = await import("../src/store.js");
  setVerifiedAttribute(hash, { attribute: "age_majority", value: true, checkedAt: new Date().toISOString() });

  const proof = (await (await app.request("/proof/" + hash)).json()) as Record<string, unknown>;
  assert.deepEqual(proof.verifiedAttribute, { attribute: "age_majority", value: true });
  const s = JSON.stringify(proof);
  for (const bad of ["ssn", "dateOfBirth", "fullName", "passport", "email", "checkedAt", "subjectRef"]) {
    assert.equal(s.toLowerCase().includes(bad.toLowerCase()), false, `leaked ${bad}`);
  }
});
