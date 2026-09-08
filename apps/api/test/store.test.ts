// store.test.ts: durable file-backed store — persistence across reload, zero-PII on disk,
// concurrent-attestation dedupe, and corrupt/absent file safety.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import * as store from "../src/store.js";

const H = (c: string) => c.repeat(64);
const payload = (h: string) => ({
  proofHash: h,
  taskId: "solar-panel-installation",
  geohash: "9q8yyk8yuv",
  capturedAt: "2026-09-06T14:32:00.000Z",
});

function freshPath(): string {
  return join(mkdtempSync(join(tmpdir(), "prufture-store-")), "store.json");
}

test("data is back after a reload pointed at the same file", () => {
  const p = freshPath();
  store.__setStorePathForTests(p);
  store.upsertProof(payload(H("a")));
  store.addAttestation(H("a"), { attester: "0xAAA", txHash: "0x1", attestedAt: "t0" });
  assert.equal(
    store.setVerifiedAttribute(H("a"), { attribute: "age_majority", value: true, checkedAt: "t1" }),
    true,
  );
  store.__flushForTests();

  store.__setStorePathForTests(p); // simulate an api restart: reload from disk
  const e = store.getProof(H("a"));
  assert.ok(e, "proof missing after reload");
  assert.deepEqual(e.payload, payload(H("a")));
  assert.equal(e.attestations.length, 1);
  assert.equal(e.attestations[0]?.attester, "0xAAA");
  assert.deepEqual(e.verifiedAttribute, { attribute: "age_majority", value: true, checkedAt: "t1" });
});

test("persisted JSON carries no PII: payload has exactly the 4 public keys, no identity field anywhere", () => {
  const p = freshPath();
  store.__setStorePathForTests(p);
  store.upsertProof(payload(H("b")));
  store.addAttestation(H("b"), { attester: "0xBBB", txHash: "0x9", attestedAt: "t" });
  store.setVerifiedAttribute(H("b"), { attribute: "age_majority", value: true, checkedAt: "t" });
  store.__flushForTests();

  const raw = readFileSync(p, "utf8");
  const obj = JSON.parse(raw) as Record<string, { payload: Record<string, unknown> }>;
  assert.deepEqual(
    Object.keys(obj[H("b")]!.payload).sort(),
    ["capturedAt", "geohash", "proofHash", "taskId"],
  );
  for (const bad of [
    "ssn", "dob", "dateofbirth", "fullname", "firstname", "lastname", "passport",
    "email", "phone", "address", "nationalid", "subjectref", "token", "faceembedding",
    "latitude", "longitude", "\"lat\"", "\"lng\"", "publickey", "signature", "mediauri",
  ]) {
    assert.equal(raw.toLowerCase().includes(bad), false, `leaked ${bad}`);
  }
});

test("concurrent addAttestation still dedupes by attester", () => {
  const p = freshPath();
  store.__setStorePathForTests(p);
  store.upsertProof(payload(H("c")));
  const attesters = ["0xA", "0xB", "0xC"];
  for (let i = 0; i < 200; i++) {
    store.addAttestation(H("c"), {
      attester: attesters[i % 3]!,
      txHash: "0x" + i,
      attestedAt: String(i),
    });
  }
  assert.equal(store.getProof(H("c"))!.attestations.length, 3);

  store.__flushForTests();
  store.__setStorePathForTests(p);
  assert.equal(store.getProof(H("c"))!.attestations.length, 3);
});

test("corrupt / partial file -> starts empty, does not throw", () => {
  const p = freshPath();
  writeFileSync(p, '{ "deadbeef": { "payload": { "proofHash": "x", ');
  assert.doesNotThrow(() => store.__setStorePathForTests(p));
  assert.equal(store.allProofs().length, 0);
});

test("absent file -> starts empty, does not throw", () => {
  const missing = join(tmpdir(), `prufture-store-missing-${Date.now()}`, "store.json");
  assert.doesNotThrow(() => store.__setStorePathForTests(missing));
  assert.equal(store.allProofs().length, 0);
});

test("preciseLocationCipher: unknown proof -> false; opaque value survives a reload", () => {
  const p = freshPath();
  store.__setStorePathForTests(p);
  assert.equal(store.setPreciseLocationCipher(H("g"), "ab".repeat(64)), false);

  store.upsertProof(payload(H("g")));
  assert.equal(store.getProof(H("g"))!.preciseLocationCipher, undefined);
  assert.equal(store.setPreciseLocationCipher(H("g"), "ab".repeat(64)), true);
  store.__flushForTests();

  store.__setStorePathForTests(p);
  assert.equal(store.getProof(H("g"))!.preciseLocationCipher, "ab".repeat(64));
});

test("verifiedPerson: unknown proof -> false; set survives a reload; not present until set", () => {
  const p = freshPath();
  store.__setStorePathForTests(p);
  assert.equal(store.setVerifiedPerson(H("e"), true), false);

  store.upsertProof(payload(H("e")));
  assert.equal(store.getProof(H("e"))!.verifiedPerson, undefined);
  assert.equal(store.setVerifiedPerson(H("e"), true), true);
  store.__flushForTests();

  store.__setStorePathForTests(p);
  assert.equal(store.getProof(H("e"))!.verifiedPerson, true);
});
