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

function payload(hash: string, geohash = "9q8yyk8yuv") {
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
    const a = attesters[Math.floor(Math.random() * attesters.length)];
    addAttestation("2".repeat(64), { attester: a, txHash: "0x" + i, attestedAt: String(i) });
  }
  assert.equal(getProof("2".repeat(64))!.attestations.length, attesters.length);
});

test("invariant: /proof and /proofs expose only a coarse region, never the full geohash", async () => {
  const full = "9q8yyk8yuvxx";
  await call("/sync", signPayload(payload("3".repeat(64), full), kp.privateKey));

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
