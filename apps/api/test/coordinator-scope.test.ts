// coordinator-scope.test.ts: coordinator_pro is sold to anyone, so the plan alone must not open the
// programme's real reports. Programme staff (PROGRAMME_STAFF_APP_USER_IDS, plus the enrolment
// admins) review the real inbox; every other subscriber gets a sample inbox of their own, whose
// reviews never touch a real report or another subscriber's sample.

import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { signPayload, generateKeyPair } from "@proof/core";
import { app } from "../src/index.js";
import { APP_USER_HEADER } from "../src/coordinator.js";
import { SAMPLE_HEADER, isSampleHash } from "../src/coordinator-sample.js";

const kp = generateKeyPair();
const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
  for (const k of [
    "REVENUECAT_SECRET_KEY",
    "REVENUECAT_PROJECT_ID",
    "REVENUECAT_COORDINATOR_ENTITLEMENT_ID",
    "PROGRAMME_STAFF_APP_USER_IDS",
    "PERSONHOOD_ADMIN_APP_USER_IDS",
    "EVIDENCE_STORAGE",
  ]) {
    delete process.env[k];
  }
});

/** Every caller is entitled; staff is decided by the env lists alone. */
function entitled(): void {
  process.env.REVENUECAT_SECRET_KEY = "sk_test_scope";
  process.env.REVENUECAT_PROJECT_ID = "proj1ab2c3d4";
  process.env.REVENUECAT_COORDINATOR_ENTITLEMENT_ID = "entl0c00rd1n4";
  process.env.PROGRAMME_STAFF_APP_USER_IDS = "staff-1";
  process.env.PERSONHOOD_ADMIN_APP_USER_IDS = "admin-1";
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ items: [{ entitlement_id: "entl0c00rd1n4" }] }), { status: 200 })) as typeof fetch;
}

const as = (id: string) => ({ [APP_USER_HEADER]: id });
const get = (path: string, id: string) => app.request(path, { headers: as(id) });
const post = (path: string, body: unknown, id: string) =>
  app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json", ...as(id) },
    body: JSON.stringify(body),
  });

async function realProof(): Promise<string> {
  const proofHash = randomBytes(32).toString("hex");
  const res = await app.request("/sync", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(
      signPayload({ proofHash, taskId: "water-pump-repair", geohash: "sb8v1", capturedAt: "2026-09-30T10:00:00.000Z" }, kp.privateKey),
    ),
  });
  assert.ok(res.status < 300);
  return proofHash;
}

type Row = { proofHash: string; taskId: string; reviewStatus: string; reviewNote: string };
const rows = async (id: string) => (await (await get("/coordinator/reports", id)).json()) as Row[];

test("programme staff and enrolment admins see the real reports", async () => {
  entitled();
  const hash = await realProof();
  for (const id of ["staff-1", "admin-1"]) {
    const res = await get("/coordinator/reports", id);
    assert.equal(res.headers.get(SAMPLE_HEADER), null);
    const list = (await res.json()) as Row[];
    assert.ok(list.some((r) => r.proofHash === hash), id);
    assert.ok(list.every((r) => !isSampleHash(r.proofHash)), id);
  }
});

test("another subscriber gets a sample inbox, never a real report", async () => {
  entitled();
  const hash = await realProof();
  const res = await get("/coordinator/reports", "buyer-1");
  assert.equal(res.headers.get(SAMPLE_HEADER), "1");
  const list = (await res.json()) as Row[];
  assert.ok(list.length >= 5, "the sample inbox has something to review");
  assert.ok(list.every((r) => isSampleHash(r.proofHash)));
  assert.ok(!list.some((r) => r.proofHash === hash));
});

test("a subscriber cannot review a real report, and it stays untouched", async () => {
  entitled();
  const hash = await realProof();
  const res = await post("/coordinator/review", { proofHash: hash, status: "rejected" }, "buyer-2");
  assert.equal(res.status, 404, "same answer as an unknown report: existence is not confirmed");
  const staffView = (await rows("staff-1")).find((r) => r.proofHash === hash)!;
  assert.equal(staffView.reviewStatus, "pending");
});

test("a subscriber's sample reviews are their own and persist across reads", async () => {
  entitled();
  const target = (await rows("buyer-3"))[0]!;
  const res = await post("/coordinator/review", { proofHash: target.proofHash, status: "accepted", note: "ok" }, "buyer-3");
  assert.equal(res.status, 200);
  const mine = (await rows("buyer-3")).find((r) => r.proofHash === target.proofHash)!;
  assert.equal(mine.reviewStatus, "accepted");
  assert.equal(mine.reviewNote, "ok");
  const theirs = (await rows("buyer-4")).find((r) => r.proofHash === target.proofHash)!;
  assert.notEqual(theirs.reviewNote, "ok", "another subscriber's sample is unaffected");
});

test("staff cannot review a sample report into the real store", async () => {
  entitled();
  const sample = (await rows("buyer-5"))[0]!;
  const res = await post("/coordinator/review", { proofHash: sample.proofHash, status: "accepted" }, "staff-1");
  assert.equal(res.status, 404);
});

test("the CSV export follows the same scope", async () => {
  entitled();
  const hash = await realProof();
  const buyer = await (await get("/coordinator/export.csv", "buyer-6")).text();
  assert.ok(!buyer.includes(hash));
  const staff = await (await get("/coordinator/export.csv", "staff-1")).text();
  assert.ok(staff.includes(hash));
});

test("evidence requests and downloads are for programme staff only", async () => {
  entitled();
  const hash = await realProof();
  assert.equal((await post("/coordinator/evidence-request", { proofHash: hash }, "buyer-7")).status, 403);
  assert.equal((await get(`/coordinator/evidence/${hash}`, "buyer-7")).status, 403);
});
