// queue-row.test.ts: invariants for the SignedProof <-> SQLite row mapping.

import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPair, hashBytes, signPayload, verifyProof } from "@proof/core";
import type { SignedProof } from "@proof/core";
import { encodeGeohash } from "../src/geohash.js";
import { buildQueueRow, COLUMNS, fromRow, insertParams, toRow } from "../src/queue-row.js";

const ALLOWED_KEYS = new Set(COLUMNS);

function randomSignedProof(): SignedProof {
  const kp = generateKeyPair();
  const bytes = new Uint8Array(Array.from({ length: 32 }, () => Math.floor(Math.random() * 256)));
  return signPayload(
    {
      proofHash: hashBytes(bytes),
      taskId: `task-${Math.floor(Math.random() * 1000)}`,
      geohash: encodeGeohash(Math.random() * 180 - 90, Math.random() * 360 - 180, 5),
      capturedAt: new Date(Math.floor(Math.random() * 1e12)).toISOString(),
    },
    kp.privateKey,
  );
}

test("invariant: a freshly queued proof is always pending_sync with 0 attestations", () => {
  for (let i = 0; i < 1000; i += 1) {
    const signed = randomSignedProof();
    const row = buildQueueRow(signed, "file:///photo.jpg", 1_700_000_000_000 + i);
    assert.equal(row.status, "pending_sync");
    assert.equal(row.attestationCount, 0);
    assert.ok(row.id.startsWith(signed.proofHash.slice(0, 12)));
    assert.equal(row.createdAt, new Date(1_700_000_000_000 + i).toISOString());
  }
});

test("invariant: queueing preserves every signed field verbatim (signature stays valid)", () => {
  for (let i = 0; i < 500; i += 1) {
    const signed = randomSignedProof();
    const row = buildQueueRow(signed, "file:///x");
    for (const k of ["proofHash", "taskId", "geohash", "capturedAt", "signature", "publicKey"] as const) {
      assert.equal(row[k], signed[k]);
    }
    assert.equal(verifyProof(row), true);
  }
});

test("invariant: fromRow(toRow(x)) is identity", () => {
  for (let i = 0; i < 500; i += 1) {
    const row = buildQueueRow(randomSignedProof(), `file:///${i}.jpg`, 1_700_000_000_000 + i);
    assert.deepEqual(fromRow(toRow(row)), row);
  }
});

test("invariant: insertParams order matches the COLUMNS list", () => {
  const row = buildQueueRow(randomSignedProof(), "file:///a.jpg");
  const params = insertParams(row);
  const asRow = toRow(row) as unknown as Record<string, unknown>;
  assert.equal(params.length, COLUMNS.length);
  COLUMNS.forEach((c, idx) => assert.equal(params[idx], asRow[c]));
});

test("invariant: the row carries only the fixed zero-PII key set", () => {
  const row = buildQueueRow(randomSignedProof(), "file:///secret/path/photo.jpg");
  for (const k of Object.keys(row)) assert.ok(ALLOWED_KEYS.has(k as (typeof COLUMNS)[number]), `unexpected key ${k}`);
  const wireKeys = COLUMNS.filter(
    (c) => c !== "mediaUri" && c !== "id" && c !== "createdAt" && c !== "reportId",
  );
  assert.deepEqual(wireKeys, [
    "proofHash",
    "taskId",
    "geohash",
    "capturedAt",
    "signature",
    "publicKey",
    "status",
    "attestationCount",
  ]);
});

test("reportId: round-trips through toRow/fromRow and defaults to '' for old rows", () => {
  const signed = randomSignedProof();
  const withId = buildQueueRow(signed, "file:///a.jpg", 1_700_000_000_000, "r".repeat(32));
  assert.equal(withId.reportId, "r".repeat(32));
  assert.equal(fromRow(toRow(withId)).reportId, "r".repeat(32));

  // A row read back from a pre-migration DB has reportId === null.
  const legacy = { ...toRow(buildQueueRow(signed, "file:///b.jpg")), reportId: null };
  assert.equal(fromRow(legacy).reportId, "");

  // Default when no id is passed.
  assert.equal(buildQueueRow(signed, "file:///c.jpg").reportId, "");
});
