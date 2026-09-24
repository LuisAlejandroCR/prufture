// port-robustness.test.ts: the ports enforce their own contract.
//
// The README promises every external call returns a typed result and never breaks the offline
// capture flow. Before this, that held only because every adapter happened to guard internally:
// the port itself called `submitter.submit()` and `port.check()` unguarded, so an adapter that
// threw propagated straight out of /sync. Verified against the previous code — a throwing
// adapter made submitAttestation reject rather than degrade.
//
// The ports exist so that adapters get ADDED. These tests pin the guarantee at the boundary
// that defines it, rather than trusting each future adapter to remember.

import { test } from "node:test";
import assert from "node:assert/strict";
import { submitThrough } from "../src/relayer.js";
import { runThrough } from "../src/assurance.js";
import type { AttestationSubmitter } from "../src/submitter.js";
import type { ProofPublicPayload } from "@proof/core";

const payload: ProofPublicPayload = {
  proofHash: "d".repeat(64),
  taskId: "t",
  geohash: "u4pru",
  capturedAt: "2026-01-01T00:00:00.000Z",
};

function submitter(submit: AttestationSubmitter["submit"]): AttestationSubmitter {
  return { name: "misbehaving", isConfigured: () => true, submit };
}

function assertTypedEnvelope(r: unknown): asserts r is { available: boolean; source: string } {
  assert.ok(r && typeof r === "object", "a result object is always returned");
  const e = r as Record<string, unknown>;
  assert.equal(typeof e.available, "boolean");
  assert.equal(typeof e.source, "string");
  assert.equal(typeof e.checkedAt, "string");
}

// --- attestation port ---------------------------------------------------------------------

test("an adapter that throws degrades instead of breaking the caller", async () => {
  const r = await submitThrough(
    submitter(async () => {
      throw new Error("adapter blew up");
    }),
    payload,
  );
  assertTypedEnvelope(r);
  assert.equal(r.available, false);
});

test("an adapter that rejects asynchronously degrades too", async () => {
  const r = await submitThrough(submitter(() => Promise.reject(new Error("async boom"))), payload);
  assertTypedEnvelope(r);
  assert.equal(r.available, false);
});

test("an adapter returning a non-conforming value degrades", async () => {
  for (const bogus of [null, undefined, {}, "ok", 42, { data: "no available flag" }]) {
    const r = await submitThrough(submitter((async () => bogus) as never), payload);
    assertTypedEnvelope(r);
    assert.equal(r.available, false, `${JSON.stringify(bogus)} must not pass as a result`);
  }
});

test("a conforming adapter's own envelope is passed through unchanged, not double-wrapped", async () => {
  const own = {
    available: true as const,
    source: "relayer/eas",
    checkedAt: "2026-01-01T00:00:00.000Z",
    data: { txHash: "0xabc", attester: "0xdef" },
    error: null,
  };
  const r = await submitThrough(submitter(async () => own), payload);
  assert.deepEqual(r, own, "the port must not wrap an envelope inside another envelope");
});

test("a conforming unavailable result is passed through unchanged too", async () => {
  const own = {
    available: false as const,
    source: "relayer/eas",
    checkedAt: "2026-01-01T00:00:00.000Z",
    data: null,
    error: "provider down",
  };
  const r = await submitThrough(submitter(async () => own), payload);
  assert.deepEqual(r, own);
});

// --- assurance ports ----------------------------------------------------------------------

test("runThrough degrades on a throwing assurance adapter", async () => {
  const r = await runThrough("liveness", "misbehaving", async () => {
    throw new Error("liveness adapter blew up");
  });
  assertTypedEnvelope(r);
  assert.equal(r.available, false);
});

test("runThrough rejects a non-conforming assurance result", async () => {
  const r = await runThrough("attribute", "misbehaving", (async () => ({ verified: true })) as never);
  assertTypedEnvelope(r);
  assert.equal(r.available, false);
});

test("runThrough passes a conforming envelope through unchanged", async () => {
  const own = {
    available: true as const,
    source: "liveness",
    checkedAt: "2026-01-01T00:00:00.000Z",
    data: { verifiedPerson: true },
    error: null,
  };
  const r = await runThrough("liveness", "ok", async () => own);
  assert.deepEqual(r, own);
});
