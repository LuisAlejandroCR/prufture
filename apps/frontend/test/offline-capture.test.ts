// offline-capture.test.ts: end-to-end invariant for Block 1 — bytes -> hash -> geohash -> sign -> queue,
// all pure, no network. Mirrors what capture.ts does on-device minus the native camera/keystore.

import { test } from "node:test";
import assert from "node:assert/strict";
import { coarsenGeohash, generateKeyPair, hashBytes, isCoarseGeohash, signPayload, verifyProof } from "@proof/core";
import { base64ToBytes } from "../src/base64.js";
import { encodeGeohash } from "../src/geohash.js";
import { buildQueueRow } from "../src/queue-row.js";

function captureOffline(photoB64: string, lat: number, lng: number, taskId: string) {
  const kp = generateKeyPair();
  const signed = signPayload(
    {
      proofHash: hashBytes(base64ToBytes(photoB64)),
      taskId,
      geohash: encodeGeohash(lat, lng, 5),
      capturedAt: new Date().toISOString(),
    },
    kp.privateKey,
  );
  return buildQueueRow(signed, "file:///photo.jpg");
}

test("fuzz: every offline capture yields a verifiable pending_sync row", () => {
  for (let i = 0; i < 500; i += 1) {
    const len = 1 + Math.floor(Math.random() * 400);
    const photo = Buffer.from(
      Array.from({ length: len }, () => Math.floor(Math.random() * 256)),
    ).toString("base64");
    const row = captureOffline(photo, Math.random() * 180 - 90, Math.random() * 360 - 180, "solar-panel-install");
    assert.equal(verifyProof(row), true);
    assert.equal(row.status, "pending_sync");
    assert.equal(row.proofHash.length, 64);
    assert.equal(row.geohash.length, 5);
  }
});

test("invariant: identical bytes -> identical proofHash; a flipped byte -> different hash", () => {
  const a = new Uint8Array([1, 2, 3, 4, 5]);
  const b = new Uint8Array([1, 2, 3, 4, 6]);
  assert.equal(hashBytes(base64ToBytes(Buffer.from(a).toString("base64"))), hashBytes(a));
  assert.notEqual(hashBytes(a), hashBytes(b));
});

test("invariant: a tampered queued row fails verification", () => {
  const row = captureOffline(Buffer.from("photo").toString("base64"), 10, 20, "t");
  assert.equal(verifyProof({ ...row, geohash: "00000" }), false);
  assert.equal(verifyProof({ ...row, proofHash: "f".repeat(64) }), false);
});

test("capture coarsens before signing, so a fine cell can never be signed or sent", () => {
  // capture.ts applies coarsenGeohash to whatever the location screen hands it. Mirrored here
  // because the real module needs the native keystore; the coarsening itself is pure.
  for (let i = 0; i < 200; i += 1) {
    const fine = encodeGeohash(Math.random() * 180 - 90, Math.random() * 360 - 180, 9);
    assert.equal(fine.length, 9);
    const signedCell = coarsenGeohash(fine);
    assert.equal(signedCell, fine.slice(0, 5));
    assert.equal(isCoarseGeohash(signedCell), true);
  }
});

test("the precise cell the api would reject is exactly the one capture never signs", () => {
  const fine = encodeGeohash(59.3326, 18.0649, 9);
  assert.equal(isCoarseGeohash(fine), false);
  assert.equal(isCoarseGeohash(coarsenGeohash(fine)), true);
});
