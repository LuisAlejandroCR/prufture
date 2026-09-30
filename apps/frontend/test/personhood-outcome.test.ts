// personhood-outcome.test.ts: the device-only programme-pass record — an attempt is marked before it
// runs, retries only pick recorded "unavailable" rows within the limits, a report is summarised once,
// and the copy stays plain (no personhood, zero-knowledge or hardware claims). Pure, in-memory storage.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canRetry,
  MAX_ATTEMPTS,
  recordAttempt,
  reportPass,
  reportPassCopy,
  retryCandidates,
  RETRY_WINDOW_MS,
  toRecord,
  type OutcomeRecord,
  type OutcomeStorage,
} from "../src/personhood-outcome";
import type { PersonhoodOutcome } from "../src/personhood-proof";

function memory(initial: OutcomeRecord[] = []): OutcomeStorage & { rows: Map<string, OutcomeRecord>; writes: OutcomeRecord[] } {
  const rows = new Map(initial.map((r) => [r.proofHash, r]));
  const writes: OutcomeRecord[] = [];
  return {
    rows,
    writes,
    get: async (h) => rows.get(h) ?? null,
    list: async () => [...rows.values()],
    put: async (r) => {
      writes.push({ ...r });
      rows.set(r.proofHash, { ...r });
    },
  };
}

const rec = (proofHash: string, outcome: PersonhoodOutcome, extra: Partial<OutcomeRecord> = {}): OutcomeRecord => ({
  proofHash,
  outcome,
  attempts: 1,
  firstAttemptAt: 1_000,
  updatedAt: 1_000,
  ...extra,
});

test("recordAttempt marks 'unavailable' before running, then stores the result", async () => {
  const s = memory();
  let seenDuring: OutcomeRecord | null = null;
  const out = await recordAttempt("0xa", s, async () => {
    seenDuring = await s.get("0xa");
    return "verified";
  }, () => 5_000);
  assert.equal(out, "verified");
  assert.deepEqual(seenDuring, rec("0xa", "unavailable", { firstAttemptAt: 5_000, updatedAt: 5_000 }));
  assert.deepEqual(s.rows.get("0xa"), rec("0xa", "verified", { firstAttemptAt: 5_000, updatedAt: 5_000 }));
});

test("recordAttempt counts attempts and keeps the first attempt time", async () => {
  const s = memory([rec("0xa", "unavailable", { attempts: 2, firstAttemptAt: 100 })]);
  await recordAttempt("0xa", s, async () => "unavailable", () => 900);
  assert.deepEqual(s.rows.get("0xa"), rec("0xa", "unavailable", { attempts: 3, firstAttemptAt: 100, updatedAt: 900 }));
});

test("recordAttempt never throws: a failing attempt or storage still resolves", async () => {
  const s = memory();
  assert.equal(await recordAttempt("0xa", s, async () => { throw new Error("prover crashed"); }), "unavailable");
  assert.equal(s.rows.get("0xa")?.outcome, "unavailable");
  const broken: OutcomeStorage = {
    get: async () => { throw new Error("db"); },
    list: async () => [],
    put: async () => { throw new Error("db"); },
  };
  assert.equal(await recordAttempt("0xb", broken, async () => "reused"), "reused");
});

test("canRetry: only 'unavailable', under the attempt cap, inside the window", () => {
  const now = 1_000 + RETRY_WINDOW_MS - 1;
  assert.equal(canRetry(rec("h", "unavailable"), now), true);
  assert.equal(canRetry(rec("h", "unavailable", { attempts: MAX_ATTEMPTS }), now), false);
  assert.equal(canRetry(rec("h", "unavailable"), 1_000 + RETRY_WINDOW_MS), false);
  for (const o of ["verified", "invalid", "reused"] as const) assert.equal(canRetry(rec("h", o), now), false);
});

test("retryCandidates: recorded 'unavailable' rows on the api only, oldest first", () => {
  const rows = [
    { proofHash: "new", status: "synced", reportId: "r3" },
    { proofHash: "pending", status: "pending_sync", reportId: "r4" },
    { proofHash: "never-tried", status: "synced", reportId: "r5" },
    { proofHash: "old", status: "attested", reportId: "r1" },
  ];
  const records = [rec("new", "unavailable"), rec("pending", "unavailable"), rec("old", "unavailable")];
  assert.deepEqual(retryCandidates(rows, records, 2_000), ["old", "new"]);
});

test("retryCandidates: skips final outcomes, exhausted rows and reports already verified", () => {
  const rows = [
    { proofHash: "a1", status: "synced", reportId: "r1" },
    { proofHash: "a2", status: "synced", reportId: "r1" },
    { proofHash: "b", status: "synced", reportId: "r2" },
    { proofHash: "c", status: "synced", reportId: "r3" },
    { proofHash: "d", status: "synced", reportId: "" },
    { proofHash: "e", status: "synced", reportId: "" },
  ];
  const records = [
    rec("a1", "verified"),
    rec("a2", "unavailable"),
    rec("b", "unavailable", { attempts: MAX_ATTEMPTS }),
    rec("c", "invalid"),
    rec("d", "verified"),
    rec("e", "unavailable"),
  ];
  // "" is not a shared report: e is not skipped because d (also "") verified.
  assert.deepEqual(retryCandidates(rows, records, 2_000), ["e"]);
});

test("reportPass: nothing attempted is null; verified wins; retrying outranks final failures", () => {
  const now = 2_000;
  assert.equal(reportPass([], now), null);
  assert.deepEqual(reportPass([rec("a", "reused"), rec("b", "verified")], now), { outcome: "verified", retrying: false });
  assert.deepEqual(reportPass([rec("a", "invalid"), rec("b", "unavailable")], now), { outcome: "unavailable", retrying: true });
  assert.deepEqual(reportPass([rec("a", "invalid"), rec("b", "reused")], now), { outcome: "invalid", retrying: false });
  assert.deepEqual(reportPass([rec("a", "reused")], now), { outcome: "reused", retrying: false });
  assert.deepEqual(reportPass([rec("a", "unavailable", { attempts: MAX_ATTEMPTS })], now), {
    outcome: "unavailable",
    retrying: false,
  });
});

test("reportPassCopy: plain language, no claims the code does not make", () => {
  const cases = [
    { outcome: "verified", retrying: false },
    { outcome: "invalid", retrying: false },
    { outcome: "reused", retrying: false },
    { outcome: "unavailable", retrying: true },
    { outcome: "unavailable", retrying: false },
  ] as const;
  const seen = new Set<string>();
  for (const c of cases) {
    const { title, body } = reportPassCopy(c);
    assert.ok(title.length > 0 && body.length > 0);
    seen.add(title);
    const text = `${title} ${body}`.toLowerCase();
    for (const banned of [
      "proof of personhood",
      "personhood",
      "zero-knowledge",
      "zk",
      "anonymous",
      "unique human",
      "sybil",
      "tee",
      "hardware",
      "semaphore",
      "nullifier",
      "guarantee",
    ]) {
      assert.ok(!new RegExp(`\\b${banned}\\b`).test(text), `${c.outcome}: "${banned}" in "${text}"`);
    }
  }
  assert.equal(seen.size, cases.length);
  assert.match(reportPassCopy({ outcome: "unavailable", retrying: true }).body, /try again/);
  assert.match(reportPassCopy({ outcome: "invalid", retrying: false }).body, /still saved and sent/);
});

test("toRecord: only well-formed rows come back", () => {
  assert.deepEqual(toRecord(rec("a", "reused")), rec("a", "reused"));
  assert.equal(toRecord(null), null);
  assert.equal(toRecord({ ...rec("a", "reused"), outcome: "maybe" }), null);
  assert.equal(toRecord({ ...rec("a", "reused"), attempts: "2" }), null);
  assert.equal(toRecord({ ...rec("a", "reused"), proofHash: 1 }), null);
});
