// precise-location.test.ts: attachPreciseLocation() posts the opaque blob to
// /precise-location, buffers on failure, retries on the next sync pass, and never throws.

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  attachPreciseLocation,
  flushPendingPreciseLocation,
  __pendingPreciseLocation,
  __resetPendingPreciseLocation,
} from "../src/sync.js";
import { __setEvidenceSecretSource, deriveEvidenceToken } from "../src/evidence-token.js";

const API = "http://api.test";
const CIPHER = "de".repeat(80);

function res(status: number): Response {
  return new Response(JSON.stringify({ status: "stored" }), { status });
}

beforeEach(() => __resetPendingPreciseLocation());

test("posts to /precise-location with proofHash + cipher, no buffer left on 200", async () => {
  const calls: { url: string; body: unknown }[] = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init?.body)) });
    return res(200);
  }) as unknown as typeof fetch;

  await attachPreciseLocation(API, "hash-1", CIPHER, fetchImpl);

  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.url, "http://api.test/precise-location");
  assert.deepEqual(calls[0]!.body, { proofHash: "hash-1", cipher: CIPHER });
  assert.equal(__pendingPreciseLocation().length, 0);
});

test("buffers on a non-ok response and never throws", async () => {
  const fetchImpl = (async () => res(404)) as unknown as typeof fetch;
  await assert.doesNotReject(attachPreciseLocation(API, "hash-2", CIPHER, fetchImpl));
  assert.deepEqual(__pendingPreciseLocation(), [{ proofHash: "hash-2", cipher: CIPHER }]);
});

test("buffers on a thrown fetch and never throws", async () => {
  const fetchImpl = (async () => {
    throw new Error("offline");
  }) as unknown as typeof fetch;
  await assert.doesNotReject(attachPreciseLocation(API, "hash-3", CIPHER, fetchImpl));
  assert.equal(__pendingPreciseLocation().length, 1);
});

test("does not double-buffer the same proofHash", async () => {
  const fetchImpl = (async () => res(500)) as unknown as typeof fetch;
  await attachPreciseLocation(API, "hash-4", CIPHER, fetchImpl);
  await attachPreciseLocation(API, "hash-4", CIPHER, fetchImpl);
  assert.equal(__pendingPreciseLocation().length, 1);
});

test("flush clears items once the api accepts them", async () => {
  let ok = false;
  const fetchImpl = (async () => res(ok ? 200 : 503)) as unknown as typeof fetch;
  await attachPreciseLocation(API, "hash-5", CIPHER, fetchImpl);
  assert.equal(__pendingPreciseLocation().length, 1);

  await flushPendingPreciseLocation(API, fetchImpl); // still failing
  assert.equal(__pendingPreciseLocation().length, 1);

  ok = true;
  await flushPendingPreciseLocation(API, fetchImpl);
  assert.equal(__pendingPreciseLocation().length, 0);
});

test("carries this device's evidence token, so a stranger cannot plant a point for the proof", async () => {
  const secret = "9".repeat(64);
  const hash = "b".repeat(64);
  __setEvidenceSecretSource(async () => secret);
  try {
    let body: unknown;
    const fetchImpl = (async (_u: string, init?: RequestInit) => {
      body = JSON.parse(String(init?.body));
      return res(200);
    }) as unknown as typeof fetch;
    await attachPreciseLocation(API, hash, CIPHER, fetchImpl);
    assert.deepEqual(body, { proofHash: hash, cipher: CIPHER, evidenceToken: deriveEvidenceToken(secret, hash) });
  } finally {
    __setEvidenceSecretSource(null);
  }
});

test("a refused owner (403) or a different stored point (409) is not retried forever", async () => {
  for (const status of [403, 409]) {
    __resetPendingPreciseLocation();
    await attachPreciseLocation(API, "hash-9", CIPHER, (async () => res(status)) as unknown as typeof fetch);
    assert.deepEqual(__pendingPreciseLocation(), [], `status ${status} left the item pending`);
  }
});
