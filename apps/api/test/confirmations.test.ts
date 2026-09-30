// confirmations.test.ts: GET /proof/:hash/confirmations groups proofs into one row per report,
// marks the caller's own report, drops coordinator-rejected reports and never leaks identifiers.

import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPair, signPayload } from "@proof/core";
import { app } from "../src/index.js";
import { taskReports } from "../src/confirmations.js";
import { setReview, setVerifiedPerson, type Entry } from "../src/store.js";

const TASK = "c7-confirmations-task";

function entry(hash: string, extra: Partial<Entry> = {}, taskId = TASK): Entry {
  return {
    payload: { proofHash: hash, taskId, geohash: "kzdwb", capturedAt: "2026-09-06T14:32:00.000Z" },
    attestations: [],
    ...extra,
  };
}

test("taskReports: one row per report, own flagged, other tasks ignored, unknown hash is null", () => {
  const rows = taskReports(
    [
      entry("a1", { reportId: "r-own" }),
      entry("a2", { reportId: "r-own" }),
      entry("b1", { reportId: "r-other", verifiedPerson: true }),
      entry("c1", {}, "another-task"),
    ],
    "a2",
    5,
  );
  assert.ok(rows);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.find((r) => r.own), { own: true, geohashRegion: "kzdwb", verifiedPerson: null, verifiedPersonDegraded: null, membershipVerified: false });
  assert.deepEqual(rows.find((r) => !r.own), { own: false, geohashRegion: "kzdwb", verifiedPerson: true, verifiedPersonDegraded: false, membershipVerified: false });
  assert.equal(taskReports([entry("a1")], "zz", 5), null);
});

test("taskReports: rejected reports are dropped; degraded only when every false verdict was degraded", () => {
  const rows = taskReports(
    [
      entry("a1"),
      entry("x1", { reportId: "rej", review: { status: "rejected", note: "blurry", reviewedAt: "t" } }),
      entry("d1", { reportId: "deg", verifiedPerson: false, verifiedPersonDegraded: true }),
      entry("f1", { reportId: "fail", verifiedPerson: false, verifiedPersonDegraded: true }),
      entry("f2", { reportId: "fail", verifiedPerson: false }),
    ],
    "a1",
    5,
  )!;
  assert.equal(rows.length, 3);
  const others = rows.filter((r) => !r.own);
  assert.deepEqual(
    others.map((r) => [r.verifiedPerson, r.verifiedPersonDegraded]).sort(),
    [[false, false], [false, true]],
  );
});

test("route: counts a second reporter's report and exposes no identifiers", async () => {
  const call = (body: unknown) =>
    app.request("/sync", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const first = generateKeyPair();
  const second = generateKeyPair();
  const p = (hash: string) => ({ proofHash: hash, taskId: "c7-route-task", geohash: "kzdwb", capturedAt: "2026-09-07T10:00:00.000Z" });
  await call({ ...signPayload(p("7".repeat(64)), first.privateKey), reportId: "c7-first" });
  await call({ ...signPayload(p("8".repeat(64)), second.privateKey), reportId: "c7-second" });
  setVerifiedPerson("8".repeat(64), true);

  const res = await app.request(`/proof/${"7".repeat(64)}/confirmations`);
  assert.equal(res.status, 200);
  const text = await res.text();
  for (const leak of ["c7-first", "c7-second", "8".repeat(64), first.publicKey, second.publicKey]) {
    assert.ok(!text.includes(leak), `must not leak ${leak.slice(0, 12)}`);
  }
  const j = JSON.parse(text) as { reports: { own: boolean; verifiedPerson: boolean | null }[] };
  assert.equal(j.reports.length, 2);
  assert.equal(j.reports.filter((r) => r.own).length, 1);
  assert.equal(j.reports.find((r) => !r.own)!.verifiedPerson, true);

  setReview("8".repeat(64), { status: "rejected", note: "", reviewedAt: "t" });
  const after = (await (await app.request(`/proof/${"7".repeat(64)}/confirmations`)).json()) as { reports: unknown[] };
  assert.equal(after.reports.length, 1);

  assert.equal((await app.request(`/proof/${"9".repeat(64)}/confirmations`)).status, 404);
});

test("taskReports: membershipVerified is true when any photo of the report carries a verified pass", () => {
  const rows = taskReports(
    [
      entry("m1", { reportId: "pass", membership: "verified" }),
      entry("m2", { reportId: "pass" }),
      entry("n1", { reportId: "no-pass" }),
      entry("n2", { reportId: "no-pass", verifiedPerson: true }),
    ],
    "m2",
    5,
  )!;
  assert.equal(rows.length, 2);
  assert.equal(rows.find((r) => r.own)!.membershipVerified, true);
  // A liveness verdict alone is not a programme pass.
  assert.equal(rows.find((r) => !r.own)!.membershipVerified, false);
});
