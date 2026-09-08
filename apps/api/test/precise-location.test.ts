// precise-location.test.ts: POST /precise-location stores the opaque encrypted blob
// against a proof, and NO public route (/proof/:hash, /proofs) ever exposes the blob,
// a 9-char geohash, or lat/lng. The api never parses or decrypts the value.

import { test } from "node:test";
import assert from "node:assert/strict";
import { signPayload, generateKeyPair } from "@proof/core";
import { app } from "../src/index.js";

const kp = generateKeyPair();
const post = (path: string, body: unknown) =>
  app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const payload = (hash: string) => ({
  proofHash: hash,
  taskId: "solar-panel-installation",
  geohash: "9q8yyk8yuv",
  capturedAt: "2026-09-06T14:32:00.000Z",
});

const CIPHER = "ab".repeat(120);

test("404 when the proof is unknown", async () => {
  const res = await post("/precise-location", { proofHash: "z".repeat(64), cipher: CIPHER });
  assert.equal(res.status, 404);
});

test("400 when proofHash or cipher is missing", async () => {
  assert.equal((await post("/precise-location", { cipher: CIPHER })).status, 400);
  assert.equal((await post("/precise-location", { proofHash: "a".repeat(64) })).status, 400);
});

test("413 when the cipher is over the length cap", async () => {
  const hash = "e".repeat(64);
  await post("/sync", signPayload(payload(hash), kp.privateKey));
  const res = await post("/precise-location", { proofHash: hash, cipher: "a".repeat(5000) });
  assert.equal(res.status, 413);
});

test("stores an opaque blob and never exposes it on any public route", async () => {
  const hash = "f".repeat(64);
  await post("/sync", signPayload(payload(hash), kp.privateKey));

  const stored = await post("/precise-location", { proofHash: hash, cipher: CIPHER });
  assert.equal(stored.status, 200);
  assert.deepEqual(await stored.json(), { status: "stored" });

  const proofBody = await (await app.request(`/proof/${hash}`)).text();
  const proofsBody = await (await app.request("/proofs")).text();

  for (const body of [proofBody, proofsBody]) {
    assert.ok(!body.includes(CIPHER), "cipher leaked");
    assert.ok(!body.toLowerCase().includes("preciselocation"), "cipher field name leaked");
    assert.ok(!body.includes("9q8yyk8yuv"), "full geohash leaked");
    assert.ok(!/"(lat|lng|latitude|longitude)"/i.test(body), "coordinate field leaked");
  }
  // /proof still coarsens the signed geohash to the 5-char region.
  assert.match(proofBody, /"geohashRegion":"9q8yy"/);
});

test("the stored value is never parsed — arbitrary non-JSON hex is accepted verbatim", async () => {
  const hash = "1".repeat(64);
  await post("/sync", signPayload(payload(hash), kp.privateKey));
  const res = await post("/precise-location", { proofHash: hash, cipher: "00ff00ff00" });
  assert.equal(res.status, 200);
});
