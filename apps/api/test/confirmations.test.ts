// confirmations.test.ts: GET /proof/:hash/confirmations groups proofs into one row per report,
// marks the caller's own report, drops coordinator-rejected reports and never leaks identifiers.

import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPair, signPayload } from "@proof/core";
import { app } from "../src/index.js";
import { communityConfirmed, communityConfirmedHashes, taskReports } from "../src/confirmations.js";
import { setMembershipVerified, setReview, setVerifiedPerson, upsertProof, type Entry } from "../src/store.js";

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

// ---- communityConfirmed: the dashboard's "Confirmed" uses the same rule as the public page ----

const pass = { membership: "verified" as const };

test("communityConfirmed: two pass-carrying reports nearby confirm; one, or no pass, does not", () => {
  const two = [entry("p1", { reportId: "r1", ...pass }), entry("p2", { reportId: "r2", ...pass }, TASK)];
  assert.equal(communityConfirmed(two, "p1", 5), true);
  assert.deepEqual([...communityConfirmedHashes(two, 5)].sort(), ["p1", "p2"]);

  const onePass = [entry("p1", { reportId: "r1", ...pass }), entry("p2", { reportId: "r2" })];
  assert.equal(communityConfirmed(onePass, "p1", 5), false);
  assert.equal(communityConfirmedHashes(onePass, 5).size, 0);

  // Two photos of ONE report are one member, never two.
  const samePerson = [entry("p1", { reportId: "r1", ...pass }), entry("p2", { reportId: "r1", ...pass })];
  assert.equal(communityConfirmedHashes(samePerson, 5).size, 0);
});

test("communityConfirmed: far-away, other-task and rejected reports never count", () => {
  const far: Entry = { ...entry("p2", { reportId: "r2", ...pass }), payload: { ...entry("p2").payload, geohash: "u6sce" } };
  assert.equal(communityConfirmedHashes([entry("p1", { reportId: "r1", ...pass }), far], 5).size, 0);
  const otherTask = [entry("p1", { reportId: "r1", ...pass }), entry("p2", { reportId: "r2", ...pass }, "another-task")];
  assert.equal(communityConfirmedHashes(otherTask, 5).size, 0);
  const rejected = [
    entry("p1", { reportId: "r1", ...pass }),
    entry("p2", { reportId: "r2", ...pass, review: { status: "rejected", note: "", reviewedAt: "2026-09-07T00:00:00Z" } }),
  ];
  assert.equal(communityConfirmedHashes(rejected, 5).size, 0);
  assert.equal(communityConfirmed([], "nope", 5), false);
});

test("communityConfirmedHashes gives the same answer as the per-proof rule on random stores", () => {
  const cells = ["d2g62", "d2g63", "d2g65", "d2g38", "u6sce", "kzdwb"];
  let seed = 7;
  const rnd = (n: number) => ((seed = (seed * 1103515245 + 12345) % 2147483648), seed % n);
  for (let round = 0; round < 40; round++) {
    const entries: Entry[] = [];
    const count = 1 + rnd(14);
    for (let i = 0; i < count; i++) {
      const e = entry(`h${round}-${i}`, {
        reportId: `r${rnd(6)}`,
        ...(rnd(3) > 0 ? { ...pass, membershipRound: rnd(2) } : {}),
        ...(rnd(8) === 0 ? { review: { status: "rejected" as const, note: "", reviewedAt: "2026-09-07T00:00:00Z" } } : {}),
      }, `task-${rnd(2)}`);
      e.payload.geohash = cells[rnd(cells.length)]!;
      entries.push(e);
    }
    const batch = communityConfirmedHashes(entries, 5);
    for (const e of entries) {
      assert.equal(batch.has(e.payload.proofHash), communityConfirmed(entries, e.payload.proofHash, 5), `round ${round} ${e.payload.proofHash}`);
    }
  }
});

test("GET /proofs and /proof/:hash carry communityConfirmed as a plain boolean", async () => {
  const task = "c7-community-confirmed-route";
  const a = "c1".repeat(32);
  const b = "c2".repeat(32);
  upsertProof({ proofHash: a, taskId: task, geohash: "d2g62", capturedAt: "2026-09-06T14:32:00.000Z" }, "route-r1");
  upsertProof({ proofHash: b, taskId: task, geohash: "d2g63", capturedAt: "2026-09-06T15:00:00.000Z" }, "route-r2");
  setMembershipVerified(a);

  const row = async (h: string) =>
    ((await (await app.request("/proofs")).json()) as Record<string, unknown>[]).find((r) => r.proofHash === h);
  assert.equal((await row(a))?.communityConfirmed, false);

  setMembershipVerified(b);
  assert.equal((await row(a))?.communityConfirmed, true);
  assert.equal((await row(b))?.communityConfirmed, true);
  const one = (await (await app.request(`/proof/${a}`)).json()) as Record<string, unknown>;
  assert.equal(one.communityConfirmed, true);
});

test("passes from different rounds never confirm each other (a new round may be the same member)", () => {
  const r0 = entry("p1", { reportId: "r1", ...pass, membershipRound: 0 });
  const r1 = entry("p2", { reportId: "r2", ...pass, membershipRound: 1 });
  assert.equal(communityConfirmedHashes([r0, r1], 5).size, 0);
  assert.equal(communityConfirmed([r0, r1], "p1", 5), false);
  // The public rows carry each pass's round, so /verify applies the same rule.
  assert.deepEqual(taskReports([r0, r1], "p1", 5)?.map((r) => r.round), [0, 1]);
  // A pass recorded before rounds were kept is round 0.
  const legacy = entry("p3", { reportId: "r3", ...pass });
  assert.deepEqual([...communityConfirmedHashes([r0, legacy], 5)].sort(), ["p1", "p3"]);
});
