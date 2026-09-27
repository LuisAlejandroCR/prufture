// cutover.test.ts: a boundary is switched only after incumbent and candidate agree over synthetic proofs.
// Load-bearing test: a real-looking payload is rejected BEFORE either adapter is called, so evaluating a
// candidate provider can never leak a real report.

import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { bytesToHex } from "viem";
import {
  SYNTHETIC_TASK_PREFIX,
  compareSubmitters,
  cutoverReady,
  isSyntheticPayload,
  syntheticPayload,
  syntheticProofHash,
  type ComparisonRow,
} from "../src/cutover.js";
import { noneSubmitter } from "../src/submitters/none.js";
import { localKeySubmitter } from "../src/submitters/local-key.js";
import type { AttestationSubmitter } from "../src/submitter.js";
import type { ProofPublicPayload } from "@proof/core";

const row = (o: Partial<ComparisonRow> = {}): ComparisonRow => ({
  incumbent: "a",
  candidate: "b",
  outcome: "both-unavailable",
  calldataDeterministic: true,
  agrees: true,
  ...o,
});

/** A submitter that records whether it was ever asked to do anything. */
function spy(available: boolean): AttestationSubmitter & { calls: number } {
  return {
    name: "spy",
    calls: 0,
    isConfigured: () => true,
    async submit() {
      (this as { calls: number }).calls++;
      return available
        ? { available: true as const, source: "relayer/eas", checkedAt: "now", data: { txHash: "0x1", attester: "0x2" }, error: null }
        : { available: false as const, source: "relayer/eas", checkedAt: "now", data: null, error: "down" };
    },
  };
}

test("a generated payload is recognised as synthetic", () => {
  for (let i = 0; i < 5; i++) assert.equal(isSyntheticPayload(syntheticPayload(i)), true);
});

test("a real-looking payload is NOT synthetic", () => {
  const real: ProofPublicPayload = {
    proofHash: bytesToHex(randomBytes(32)).slice(2),
    taskId: "solar-panel-installation",
    geohash: "9q8yy",
    capturedAt: "2026-09-06T14:32:00.000Z",
  };
  assert.equal(isSyntheticPayload(real), false);
});

test("the reserved prefix alone does not make a payload synthetic", () => {
  // Smuggling attempt: a real media hash renamed to look like a test fixture.
  const smuggled: ProofPublicPayload = {
    proofHash: bytesToHex(randomBytes(32)).slice(2),
    taskId: `${SYNTHETIC_TASK_PREFIX}1`,
    geohash: "u4pru",
    capturedAt: "2026-01-01T00:00:00.000Z",
  };
  assert.equal(isSyntheticPayload(smuggled), false, "the hash must be recomputable, not just named");
});

test("a correct hash under a real task name is not synthetic either", () => {
  const p = syntheticPayload(3);
  assert.equal(isSyntheticPayload({ ...p, taskId: "solar-panel-installation" }), false);
});

test("tampering with any field breaks the synthetic check", () => {
  const p = syntheticPayload(7);
  assert.equal(isSyntheticPayload({ ...p, capturedAt: "2026-02-02T00:00:00.000Z" }), false);
  assert.equal(isSyntheticPayload({ ...p, proofHash: "0".repeat(64) }), false);
  assert.equal(isSyntheticPayload({ ...p, taskId: `${SYNTHETIC_TASK_PREFIX}other` }), false);
});

test("malformed input is refused rather than throwing", () => {
  for (const bad of [{}, { taskId: 1 }, { taskId: "synthetic-1" }, null, undefined]) {
    assert.equal(isSyntheticPayload(bad as unknown as ProofPublicPayload), false);
  }
});

test("the synthetic hash is domain-separated and deterministic", () => {
  const a = syntheticProofHash("synthetic-1", "2026-01-01T00:00:00.000Z");
  assert.equal(a, syntheticProofHash("synthetic-1", "2026-01-01T00:00:00.000Z"));
  assert.notEqual(a, syntheticProofHash("synthetic-2", "2026-01-01T00:00:00.000Z"));
  assert.match(a, /^[0-9a-f]{64}$/);
});

// The refusal happens before any adapter runs.
test("comparing a non-synthetic payload refuses WITHOUT calling either adapter", async () => {
  const incumbent = spy(true);
  const candidate = spy(true);
  const real: ProofPublicPayload = {
    proofHash: bytesToHex(randomBytes(32)).slice(2),
    taskId: "water-pump-repair",
    geohash: "9q8yy",
    capturedAt: "2026-09-06T14:32:00.000Z",
  };

  await assert.rejects(() => compareSubmitters(incumbent, candidate, real), /non-synthetic/);
  assert.equal(incumbent.calls, 0, "the incumbent must not see a real payload");
  assert.equal(candidate.calls, 0, "a candidate provider must never see a real payload");
});

test("two agreeing adapters report agreement and deterministic calldata", async () => {
  const r = await compareSubmitters(spy(false), spy(false), syntheticPayload(1));
  assert.equal(r.agrees, true);
  assert.equal(r.outcome, "both-unavailable");
  assert.equal(r.calldataDeterministic, true);
});

test("two available adapters report both-available", async () => {
  const r = await compareSubmitters(spy(true), spy(true), syntheticPayload(2));
  assert.equal(r.outcome, "both-available");
  assert.equal(r.agrees, true);
});

test("a divergence is reported, not smoothed over", async () => {
  const r = await compareSubmitters(spy(true), spy(false), syntheticPayload(3));
  assert.equal(r.outcome, "diverged");
  assert.equal(r.agrees, false);
});

test("the comparison row carries no vendor response, receipt body or key material", async () => {
  const r = await compareSubmitters(spy(true), spy(true), syntheticPayload(4));
  assert.deepEqual(
    Object.keys(r).sort(),
    ["agrees", "calldataDeterministic", "candidate", "incumbent", "outcome"],
  );
  const blob = JSON.stringify(r);
  assert.ok(!blob.includes("0x1"), "no txHash in the row");
  assert.ok(!blob.includes("0x2"), "no attester in the row");
});

test("the real adapters can be compared and agree while unconfigured", async () => {
  const r = await compareSubmitters(localKeySubmitter, noneSubmitter, syntheticPayload(5));
  assert.equal(r.agrees, true, "both degrade with no credentials");
  assert.equal(r.outcome, "both-unavailable");
});

test("cutoverReady requires every row to agree", () => {
  assert.equal(cutoverReady([row(), row()]), true);
  assert.equal(cutoverReady([row(), row({ agrees: false })]), false);
  assert.equal(cutoverReady([row({ calldataDeterministic: false })]), false);
});

test("cutoverReady is false with no observations at all", () => {
  assert.equal(cutoverReady([]), false, "an empty run must never authorise a switch");
});
