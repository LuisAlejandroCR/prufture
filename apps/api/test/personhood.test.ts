// personhood.test.ts: the Semaphore membership check against real proofs from committed fixtures
// (no artifact download in `npm test`). Covers every state, the report binding, the per-scope
// nullifier, and that the nullifier never escapes in a result.

import { test, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  closePersonhoodVerifier,
  expectedScope,
  memoryNullifierStore,
  personhoodEnabled,
  verifyMembership,
  type MembershipDeps,
  type ScopeParts,
} from "../src/personhood.js";

const fx = JSON.parse(readFileSync(new URL("./fixtures/semaphore-proofs.json", import.meta.url), "utf8"));

const scopeOf = (s: { programmeId: string; taskId: string; epoch: string; policyVersion: string }): ScopeParts => ({
  ...s,
  epoch: BigInt(s.epoch),
  policyVersion: BigInt(s.policyVersion),
});
const SCOPE_A = expectedScope(scopeOf(fx.scopes.A));
const SCOPE_B = expectedScope(scopeOf(fx.scopes.B));
const ROOTS = [fx.root];

const on = (extra: Partial<MembershipDeps> = {}): MembershipDeps => ({
  nullifiers: memoryNullifierStore(),
  enabled: () => true,
  ...extra,
});

after(closePersonhoodVerifier);

afterEach(() => {
  delete process.env.PERSONHOOD_PROVIDER;
});

test("flag is off by default and only 'semaphore' turns it on", () => {
  assert.equal(personhoodEnabled(), false);
  process.env.PERSONHOOD_PROVIDER = "zk";
  assert.equal(personhoodEnabled(), false);
  process.env.PERSONHOOD_PROVIDER = " semaphore ";
  assert.equal(personhoodEnabled(), true);
});

test("off -> unavailable, even for a valid proof", async () => {
  const r = await verifyMembership(
    { proof: fx.first, proofHash: fx.hashes.one, scope: SCOPE_A, acceptedRoots: ROOTS },
    { nullifiers: memoryNullifierStore() },
  );
  assert.deepEqual(r, { state: "unavailable", reason: "disabled" });
});

test("scope matches the fixture generator and differs per task", () => {
  assert.equal(BigInt(fx.first.scope), SCOPE_A);
  assert.notEqual(SCOPE_A, SCOPE_B);
});

test("a real member proof bound to its report verifies", async () => {
  const r = await verifyMembership(
    { proof: fx.first, proofHash: fx.hashes.one, scope: SCOPE_A, acceptedRoots: ROOTS },
    on(),
  );
  assert.deepEqual(r, { state: "verified", reason: "ok" });
});

test("regression: the bare hex hash /sync stores binds the same proof as its 0x form", async () => {
  // packages/core hashBytes() makes proof hashes without 0x, and that is how the store keys them.
  // Only 0x was accepted here, so every real report came back invalid.
  const bare = (fx.hashes.one as string).slice(2);
  const r = await verifyMembership({ proof: fx.first, proofHash: bare, scope: SCOPE_A, acceptedRoots: ROOTS }, on());
  assert.deepEqual(r, { state: "verified", reason: "ok" });
});

test("result carries only state + reason, never proof material", async () => {
  const r = await verifyMembership(
    { proof: fx.first, proofHash: fx.hashes.one, scope: SCOPE_A, acceptedRoots: ROOTS },
    on(),
  );
  assert.deepEqual(Object.keys(r).sort(), ["reason", "state"]);
  assert.ok(!JSON.stringify(r).includes(fx.first.nullifier));
});

test("same member, same task, second report -> reused", async () => {
  const deps = on();
  const first = await verifyMembership(
    { proof: fx.first, proofHash: fx.hashes.one, scope: SCOPE_A, acceptedRoots: ROOTS },
    deps,
  );
  const second = await verifyMembership(
    { proof: fx.sameMemberSameScope, proofHash: fx.hashes.two, scope: SCOPE_A, acceptedRoots: ROOTS },
    deps,
  );
  assert.equal(first.state, "verified");
  assert.deepEqual(second, { state: "reused", reason: "nullifier_used" });
});

test("same member, other task -> verified; other member, same task -> verified", async () => {
  const deps = on();
  await verifyMembership({ proof: fx.first, proofHash: fx.hashes.one, scope: SCOPE_A, acceptedRoots: ROOTS }, deps);
  const otherTask = await verifyMembership(
    { proof: fx.sameMemberOtherScope, proofHash: fx.hashes.three, scope: SCOPE_B, acceptedRoots: ROOTS },
    deps,
  );
  const otherMember = await verifyMembership(
    { proof: fx.otherMember, proofHash: fx.hashes.three, scope: SCOPE_A, acceptedRoots: ROOTS },
    deps,
  );
  assert.equal(otherTask.state, "verified");
  assert.equal(otherMember.state, "verified");
});

test("proof replayed onto a different report -> invalid (message_mismatch)", async () => {
  const r = await verifyMembership(
    { proof: fx.first, proofHash: fx.hashes.two, scope: SCOPE_A, acceptedRoots: ROOTS },
    on(),
  );
  assert.deepEqual(r, { state: "invalid", reason: "message_mismatch" });
});

test("proof for another task -> invalid (scope_mismatch)", async () => {
  const r = await verifyMembership(
    { proof: fx.first, proofHash: fx.hashes.one, scope: SCOPE_B, acceptedRoots: ROOTS },
    on(),
  );
  assert.deepEqual(r, { state: "invalid", reason: "scope_mismatch" });
});

test("root the programme does not accept -> invalid (unknown_root)", async () => {
  const r = await verifyMembership(
    { proof: fx.first, proofHash: fx.hashes.one, scope: SCOPE_A, acceptedRoots: ["1"] },
    on(),
  );
  assert.deepEqual(r, { state: "invalid", reason: "unknown_root" });
});

test("tampered proof point -> invalid (bad_proof) and the nullifier is not burned", async () => {
  const deps = on();
  const points = [...fx.first.points];
  points[0] = (BigInt(points[0]) + 1n).toString();
  const bad = await verifyMembership(
    { proof: { ...fx.first, points }, proofHash: fx.hashes.one, scope: SCOPE_A, acceptedRoots: ROOTS },
    deps,
  );
  assert.deepEqual(bad, { state: "invalid", reason: "bad_proof" });
  const good = await verifyMembership(
    { proof: fx.first, proofHash: fx.hashes.one, scope: SCOPE_A, acceptedRoots: ROOTS },
    deps,
  );
  assert.equal(good.state, "verified");
});

test("forged nullifier with the real points -> invalid (bad_proof)", async () => {
  const forged = { ...fx.first, nullifier: "12345" };
  const r = await verifyMembership(
    { proof: forged, proofHash: fx.hashes.one, scope: SCOPE_A, acceptedRoots: ROOTS },
    on(),
  );
  assert.deepEqual(r, { state: "invalid", reason: "bad_proof" });
});

test("malformed input -> invalid (malformed), never a throw", async () => {
  const cases: unknown[] = [
    null,
    "proof",
    { ...fx.first, merkleTreeDepth: 0 },
    { ...fx.first, merkleTreeDepth: 33 },
    { ...fx.first, points: fx.first.points.slice(0, 7) },
    { ...fx.first, message: "0x11" },
    { ...fx.first, nullifier: -1 },
  ];
  for (const proof of cases) {
    const r = await verifyMembership({ proof, proofHash: fx.hashes.one, scope: SCOPE_A, acceptedRoots: ROOTS }, on());
    assert.deepEqual(r, { state: "invalid", reason: "malformed" }, JSON.stringify(proof)?.slice(0, 60));
  }
  const badHash = await verifyMembership(
    { proof: fx.first, proofHash: "0x11", scope: SCOPE_A, acceptedRoots: ROOTS },
    on(),
  );
  assert.equal(badHash.reason, "malformed");
});

test("a throwing verifier degrades to unavailable, not invalid", async () => {
  const r = await verifyMembership(
    { proof: fx.first, proofHash: fx.hashes.one, scope: SCOPE_A, acceptedRoots: ROOTS },
    on({ verify: async () => { throw new Error("boom"); } }),
  );
  assert.deepEqual(r, { state: "unavailable", reason: "verifier_error" });
});

test("two concurrent submissions of one nullifier: exactly one verifies", async () => {
  const deps = on();
  const [a, b] = await Promise.all([
    verifyMembership({ proof: fx.first, proofHash: fx.hashes.one, scope: SCOPE_A, acceptedRoots: ROOTS }, deps),
    verifyMembership(
      { proof: fx.sameMemberSameScope, proofHash: fx.hashes.two, scope: SCOPE_A, acceptedRoots: ROOTS },
      deps,
    ),
  ]);
  assert.deepEqual([a.state, b.state].sort(), ["reused", "verified"]);
});
