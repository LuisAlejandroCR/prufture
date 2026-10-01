// personhood-routes.test.ts: the HTTP surface of the Semaphore layer — coordinator-only enrolment,
// public group read, report-bound proof submission with a server-derived scope, and persistence of
// groups, nullifiers and the write-once "verified" membership across a restart.

import { test, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { app } from "../src/index.js";
import * as store from "../src/store.js";
import { APP_USER_HEADER } from "../src/coordinator.js";
import { closePersonhoodVerifier, enrolCommitment } from "../src/personhood.js";

const fx = JSON.parse(readFileSync(new URL("./fixtures/semaphore-proofs.json", import.meta.url), "utf8"));
const PROGRAMME = "pilot-1";
const realFetch = globalThis.fetch;

after(closePersonhoodVerifier);
afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.PERSONHOOD_PROVIDER;
  delete process.env.REVENUECAT_SECRET_KEY;
  delete process.env.REVENUECAT_PROJECT_ID;
  delete process.env.REVENUECAT_COORDINATOR_ENTITLEMENT_ID;
  delete process.env.PERSONHOOD_ADMIN_APP_USER_IDS;
});

function freshStore(): string {
  const p = join(tmpdir(), `prufture-personhood-${randomUUID()}.json`);
  store.__setStorePathForTests(p);
  return p;
}

function seedReport(proofHash: string, taskId = fx.scopes.A.taskId): void {
  store.upsertProof({ proofHash, taskId, geohash: "9q8yy", capturedAt: "2026-09-06T14:32:00.000Z" });
}

function seedGroup(): void {
  let g;
  for (const c of fx.commitments) g = enrolCommitment(g, c).group;
  store.putPersonhoodGroup(PROGRAMME, g!);
}

/** An entitled coordinator. `admin`: also on PERSONHOOD_ADMIN_APP_USER_IDS (the dashboard's account). */
function coordinator(admin = true, id = "anon-coordinator-1"): Record<string, string> {
  process.env.PERSONHOOD_ADMIN_APP_USER_IDS = admin ? `other-admin, ${id}` : "other-admin";
  process.env.REVENUECAT_SECRET_KEY = "sk_test_personhood";
  process.env.REVENUECAT_PROJECT_ID = "proj1ab2c3d4";
  process.env.REVENUECAT_COORDINATOR_ENTITLEMENT_ID = "entl0c00rd1n4";
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ items: [{ entitlement_id: "entl0c00rd1n4" }] }), { status: 200 })) as typeof fetch;
  return { [APP_USER_HEADER]: id };
}

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  app.request(path, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

test("enrolling the fixture members in order reproduces the proofs' root", () => {
  let g;
  for (const c of fx.commitments) g = enrolCommitment(g, c).group;
  assert.equal(g!.roots.at(-1), fx.root);
  assert.equal(g!.roots.length, 5);
  assert.equal(enrolCommitment(g, fx.commitments[0]).added, false);
});

test("enrol is coordinator-only", async () => {
  freshStore();
  const res = await post("/coordinator/personhood/enrol", { programmeId: PROGRAMME, commitment: fx.commitments[0] });
  assert.equal(res.status, 401);
  assert.equal(store.getPersonhoodGroup(PROGRAMME), undefined);
});

test("a paying coordinator who is not a programme admin cannot enrol or start a round", async () => {
  // Any subscriber holds coordinator_pro. Enrolling their own commitments would mint "members" that
  // confirm their own reports; a new round lets the same member confirm again.
  freshStore();
  seedGroup();
  const before = store.getPersonhoodGroup(PROGRAMME);
  const h = coordinator(false);
  const enrol = await post("/coordinator/personhood/enrol", { programmeId: PROGRAMME, commitment: "12345" }, h);
  assert.equal(enrol.status, 403);
  const epoch = await post("/coordinator/personhood/epoch", { programmeId: PROGRAMME }, h);
  assert.equal(epoch.status, 403);
  assert.deepEqual(store.getPersonhoodGroup(PROGRAMME), before);
});

test("with no admin configured, enrolment is closed rather than open to every subscriber", async () => {
  freshStore();
  const h = coordinator();
  delete process.env.PERSONHOOD_ADMIN_APP_USER_IDS;
  const res = await post("/coordinator/personhood/enrol", { programmeId: PROGRAMME, commitment: fx.commitments[0] }, h);
  assert.equal(res.status, 403);
  assert.equal(store.getPersonhoodGroup(PROGRAMME), undefined);
});

test("coordinator enrols, idempotently; bad input is 400", async () => {
  freshStore();
  const h = coordinator();
  const first = await post("/coordinator/personhood/enrol", { programmeId: PROGRAMME, commitment: fx.commitments[0] }, h);
  assert.deepEqual(await first.json(), { added: true, size: 1, epoch: 1 });
  const again = await post("/coordinator/personhood/enrol", { programmeId: PROGRAMME, commitment: fx.commitments[0] }, h);
  assert.deepEqual(await again.json(), { added: false, size: 1, epoch: 1 });
  for (const body of [
    { programmeId: "Pilot 1", commitment: fx.commitments[0] },
    { programmeId: PROGRAMME, commitment: "0" },
    { programmeId: PROGRAMME, commitment: "0x12" },
  ]) {
    assert.equal((await post("/coordinator/personhood/enrol", body, h)).status, 400);
  }
});

test("public group read returns commitments + epoch + root, never nullifiers", async () => {
  freshStore();
  seedGroup();
  const res = await app.request(`/personhood/group/${PROGRAMME}`);
  const body = (await res.json()) as Record<string, unknown>;
  assert.deepEqual(Object.keys(body).sort(), ["commitments", "epoch", "programmeId", "root"]);
  assert.equal(body.root, fx.root);
  assert.equal((await app.request("/personhood/group/nope")).status, 404);
});

test("valid proof -> verified, persisted on the report, shown on /proof; replay -> reused", async () => {
  freshStore();
  seedGroup();
  seedReport(fx.hashes.one);
  seedReport(fx.hashes.two);
  process.env.PERSONHOOD_PROVIDER = "semaphore";

  const ok = await post("/personhood/proof", { proofHash: fx.hashes.one, programmeId: PROGRAMME, proof: fx.first });
  assert.deepEqual(await ok.json(), { state: "verified" });
  const pub = (await (await app.request(`/proof/${fx.hashes.one}`)).json()) as Record<string, unknown>;
  assert.equal(pub.membership, "verified");
  assert.ok(!JSON.stringify(pub).includes(fx.first.nullifier));

  const reused = await post("/personhood/proof", {
    proofHash: fx.hashes.two,
    programmeId: PROGRAMME,
    proof: fx.sameMemberSameScope,
  });
  assert.deepEqual(await reused.json(), { state: "reused" });
  assert.equal(((await (await app.request(`/proof/${fx.hashes.two}`)).json()) as { membership: unknown }).membership, null);
});

test("scope comes from the stored report's taskId, not the body", async () => {
  freshStore();
  seedGroup();
  // The report is for task B; a proof made for task A must not verify against it.
  seedReport(fx.hashes.one, fx.scopes.B.taskId);
  process.env.PERSONHOOD_PROVIDER = "semaphore";
  const res = await post("/personhood/proof", {
    proofHash: fx.hashes.one,
    programmeId: PROGRAMME,
    proof: fx.first,
    taskId: fx.scopes.A.taskId,
  });
  assert.deepEqual(await res.json(), { state: "invalid" });
});

test("a new epoch opens a new round for the same task", async () => {
  freshStore();
  seedGroup();
  const h = coordinator();
  const res = await post("/coordinator/personhood/epoch", { programmeId: PROGRAMME }, h);
  assert.deepEqual(await res.json(), { epoch: 2 });
  seedReport(fx.hashes.one);
  process.env.PERSONHOOD_PROVIDER = "semaphore";
  // The fixture proofs were made for epoch 1, so they no longer match the scope.
  const r = await post("/personhood/proof", { proofHash: fx.hashes.one, programmeId: PROGRAMME, proof: fx.first });
  assert.deepEqual(await r.json(), { state: "invalid" });
});

test("a failed attempt never marks the report", async () => {
  freshStore();
  seedGroup();
  seedReport(fx.hashes.two);
  process.env.PERSONHOOD_PROVIDER = "semaphore";
  const r = await post("/personhood/proof", { proofHash: fx.hashes.two, programmeId: PROGRAMME, proof: fx.first });
  assert.deepEqual(await r.json(), { state: "invalid" });
  assert.equal(store.getProof(fx.hashes.two)?.membership, undefined);
});

test("each verdict is logged with its reason code only, so a rejection can be diagnosed from the logs", async () => {
  freshStore();
  seedGroup();
  seedReport(fx.hashes.two);
  process.env.PERSONHOOD_PROVIDER = "semaphore";
  const lines: string[] = [];
  const realLog = console.log;
  console.log = (...a: unknown[]) => void lines.push(a.map(String).join(" "));
  try {
    await post("/personhood/proof", { proofHash: fx.hashes.two, programmeId: PROGRAMME, proof: fx.first });
  } finally {
    console.log = realLog;
  }
  const logged = lines.filter((l) => l.startsWith("personhood "));
  assert.equal(logged.length, 1);
  assert.deepEqual(JSON.parse(logged[0]!.slice("personhood ".length)), {
    report: (fx.hashes.two as string).replace(/^0x/, "").slice(0, 12),
    state: "invalid",
    reason: "message_mismatch",
  });
  for (const secret of [fx.first.nullifier, fx.first.points[0], fx.first.merkleTreeRoot, fx.hashes.two]) {
    assert.ok(!logged[0]!.includes(secret), "no proof material or full report hash in the log");
  }
});

test("flag off -> unavailable; unknown report or programme -> 404", async () => {
  freshStore();
  seedGroup();
  seedReport(fx.hashes.one);
  const off = await post("/personhood/proof", { proofHash: fx.hashes.one, programmeId: PROGRAMME, proof: fx.first });
  assert.deepEqual(await off.json(), { state: "unavailable" });
  assert.equal((await post("/personhood/proof", { proofHash: fx.hashes.two, programmeId: PROGRAMME, proof: fx.first })).status, 404);
  assert.equal((await post("/personhood/proof", { proofHash: fx.hashes.one, programmeId: "other", proof: fx.first })).status, 404);
});

const scopeUrl = (programmeId: string, proofHash: string) =>
  `/personhood/scope?programmeId=${encodeURIComponent(programmeId)}&proofHash=${encodeURIComponent(proofHash)}`;

test("scope route returns the exact scope the fixture proof was made for, and nothing else", async () => {
  freshStore();
  seedGroup();
  seedReport(fx.hashes.one);
  const res = await app.request(scopeUrl(PROGRAMME, fx.hashes.one));
  assert.equal(res.status, 200);
  const body = (await res.json()) as Record<string, unknown>;
  assert.deepEqual(Object.keys(body).sort(), ["epoch", "scope"]);
  assert.deepEqual(body, { scope: fx.first.scope, epoch: 1 });
  assert.ok(!JSON.stringify(body).includes(fx.first.nullifier));
});

test("scope route follows the stored taskId and the current epoch", async () => {
  freshStore();
  seedGroup();
  seedReport(fx.hashes.one, fx.scopes.B.taskId);
  const b = (await (await app.request(scopeUrl(PROGRAMME, fx.hashes.one))).json()) as { scope: string };
  assert.notEqual(b.scope, fx.first.scope);
  assert.match(b.scope, /^[0-9]+$/);

  seedReport(fx.hashes.two);
  const h = coordinator();
  await post("/coordinator/personhood/epoch", { programmeId: PROGRAMME }, h);
  const next = (await (await app.request(scopeUrl(PROGRAMME, fx.hashes.two))).json()) as { scope: string; epoch: number };
  assert.equal(next.epoch, 2);
  assert.notEqual(next.scope, fx.first.scope);
});

test("scope route: invalid programmeId -> 400, unknown programme or proofHash -> 404", async () => {
  freshStore();
  seedGroup();
  seedReport(fx.hashes.one);
  assert.equal((await app.request(scopeUrl("Pilot 1", fx.hashes.one))).status, 400);
  assert.equal((await app.request(`/personhood/scope?proofHash=${fx.hashes.one}`)).status, 400);
  assert.equal((await app.request(scopeUrl("other", fx.hashes.one))).status, 404);
  assert.equal((await app.request(scopeUrl(PROGRAMME, fx.hashes.two))).status, 404);
  assert.equal((await app.request(`/personhood/scope?programmeId=${PROGRAMME}`)).status, 404);
});

test("groups, nullifiers and membership survive a restart; junk is dropped", async () => {
  const p = freshStore();
  seedGroup();
  seedReport(fx.hashes.one);
  seedReport(fx.hashes.two);
  process.env.PERSONHOOD_PROVIDER = "semaphore";
  await post("/personhood/proof", { proofHash: fx.hashes.one, programmeId: PROGRAMME, proof: fx.first });
  store.__flushForTests();

  store.__setStorePathForTests(p); // simulate a restart
  assert.equal(store.getProof(fx.hashes.one)?.membership, "verified");
  // The round the pass was proven in survives too, or a restart would merge rounds.
  assert.equal(store.getProof(fx.hashes.one)?.membershipRound, store.getPersonhoodGroup(PROGRAMME)?.epoch);
  assert.equal(store.getPersonhoodGroup(PROGRAMME)?.roots.at(-1), fx.root);
  const replay = await post("/personhood/proof", {
    proofHash: fx.hashes.two,
    programmeId: PROGRAMME,
    proof: fx.sameMemberSameScope,
  });
  assert.deepEqual(await replay.json(), { state: "reused" });

  // Hand-edited file: a forged membership value and non-numeric commitments do not survive.
  const raw = JSON.parse(readFileSync(p, "utf8"));
  raw[fx.hashes.two].membership = "trusted";
  raw[fx.hashes.one].membershipRound = "7";
  raw.__personhoodGroups__[PROGRAMME].commitments.push("not-a-number");
  const { writeFileSync } = await import("node:fs");
  writeFileSync(p, JSON.stringify(raw));
  store.__setStorePathForTests(p);
  assert.equal(store.getProof(fx.hashes.two)?.membership, undefined);
  assert.equal(store.getProof(fx.hashes.one)?.membershipRound, undefined, "a non-numeric round is dropped");
  assert.equal(store.getPersonhoodGroup(PROGRAMME)?.commitments.length, 5);
});

test("/health says whether a programme admin is configured, never who", async () => {
  process.env.PERSONHOOD_ADMIN_APP_USER_IDS = "admin-app-user-9";
  const on = await (await app.request("/health")).text();
  assert.equal((JSON.parse(on) as { personhoodEnrolment: boolean }).personhoodEnrolment, true);
  assert.ok(!on.includes("admin-app-user-9"));
  delete process.env.PERSONHOOD_ADMIN_APP_USER_IDS;
  const off = (await (await app.request("/health")).json()) as { personhoodEnrolment: boolean };
  assert.equal(off.personhoodEnrolment, false);
});

test("/health says whether the programme pass is on", async () => {
  process.env.PERSONHOOD_PROVIDER = "semaphore";
  assert.equal(((await (await app.request("/health")).json()) as { programmePass: boolean }).programmePass, true);
  delete process.env.PERSONHOOD_PROVIDER;
  assert.equal(((await (await app.request("/health")).json()) as { programmePass: boolean }).programmePass, false);
});
