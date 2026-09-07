// offline-capture.test.ts: end-to-end invariant for Block 1 — bytes -> hash -> geohash -> sign -> queue,
// all pure, no network. Mirrors what capture.ts does on-device minus the native camera/keystore.

import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPair, hashBytes, signPayload, verifyProof } from "@proof/core";
import { base64ToBytes } from "./base64.js";
import { encodeGeohash } from "./geohash.js";
import { buildQueueRow } from "./queue-row.js";

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
