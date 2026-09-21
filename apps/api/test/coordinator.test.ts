// coordinator.test.ts: the paid surface. Two guarantees under test — the gate FAILS CLOSED
// (no header, degraded check and not-entitled are all refused, and a degraded check is never
// reported as "not entitled"), and the coordinator view adds review state WITHOUT adding a
// reporter identity, a precise location, a signature or a public key.

import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPair, signPayload } from "@proof/core";
import { app } from "../src/index.js";
import { getProof, upsertProof } from "../src/store.js";
import { APP_USER_HEADER, toCsv, type CoordinatorRow } from "../src/coordinator.js";

const kp = generateKeyPair();
const realFetch = globalThis.fetch;
const SECRET = "sk_test_coordinator_secret";
const USER = "anon-coordinator-1";

function payload(hash: string) {
  return {
    proofHash: hash,
    taskId: "solar-panel-installation",
    geohash: "9q8yy",
    capturedAt: "2026-09-06T14:32:00.000Z",
  };
}

/** Stub RevenueCat: entitled / not entitled / unreachable. */
function revenuecat(mode: "entitled" | "denied" | "down"): void {
  process.env.REVENUECAT_SECRET_KEY = SECRET;
  process.env.REVENUECAT_PROJECT_ID = "proj1ab2c3d4";
  globalThis.fetch = (async () => {
    if (mode === "down") throw new Error("network down");
    const items = mode === "entitled" ? [{ entitlement_id: "coordinator_pro" }] : [];
    return new Response(JSON.stringify({ items }), { status: 200 });
  }) as typeof fetch;
}

const get = (path: string, headers: Record<string, string> = {}) => app.request(path, { headers });
const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

const asCoordinator = { [APP_USER_HEADER]: USER };

afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.REVENUECAT_SECRET_KEY;
  delete process.env.REVENUECAT_API_BASE;
  delete process.env.REVENUECAT_PROJECT_ID;
});

test("gate: no app user id => 401 on every coordinator route", async () => {
  revenuecat("entitled");
  assert.equal((await get("/coordinator/reports")).status, 401);
  assert.equal((await get("/coordinator/export.csv")).status, 401);
  assert.equal(
    (await post("/coordinator/review", { proofHash: "x", status: "accepted" })).status,
    401,
  );
});

test("gate: entitlement check unreachable => 503 degraded, NOT 402", async () => {
  revenuecat("down");
  const res = await get("/coordinator/reports", asCoordinator);
  assert.equal(res.status, 503, "a degraded check must fail closed, not deny the customer");
  const j = (await res.json()) as { error: string; degraded: boolean };
  assert.equal(j.degraded, true);
  assert.match(j.error, /unavailable/);
});

test("gate: REVENUECAT_SECRET_KEY unset => 503, and the key never appears in a response", async () => {
  delete process.env.REVENUECAT_SECRET_KEY;
  const res = await get("/coordinator/reports", asCoordinator);
  assert.equal(res.status, 503);
  assert.ok(!(await res.text()).includes(SECRET));
});

test("gate: no coordinator_pro => 402", async () => {
  revenuecat("denied");
  const res = await get("/coordinator/reports", asCoordinator);
  assert.equal(res.status, 402);
  const j = (await res.json()) as { entitled: boolean };
  assert.equal(j.entitled, false);
});

test("gate: entitled => 200 and rows default to review status pending", async () => {
  revenuecat("entitled");
  const hash = "a1".repeat(32);
  upsertProof(payload(hash));
  const rows = (await (await get("/coordinator/reports", asCoordinator)).json()) as CoordinatorRow[];
  const row = rows.find((r) => r.proofHash === hash);
  assert.ok(row, "the proof must be listed");
  assert.equal(row.reviewStatus, "pending");
  assert.equal(row.reviewNote, "");
  assert.equal(row.geohashRegion, "9q8yy");
});

test("review: records a verdict, replaces it on a second call, and 404s an unknown proof", async () => {
  revenuecat("entitled");
  const hash = "b2".repeat(32);
  upsertProof(payload(hash));

  const first = await post(
    "/coordinator/review",
    { proofHash: hash, status: "accepted", note: "panel visible" },
    asCoordinator,
  );
  assert.equal(first.status, 200);
  assert.equal(getProof(hash)!.review!.status, "accepted");

  await post(
    "/coordinator/review",
    { proofHash: hash, status: "rejected", note: "duplicate" },
    asCoordinator,
  );
  assert.equal(getProof(hash)!.review!.status, "rejected", "the store holds current state, not a trail");
  assert.equal(getProof(hash)!.review!.note, "duplicate");

  const missing = await post(
    "/coordinator/review",
    { proofHash: "c3".repeat(32), status: "accepted" },
    asCoordinator,
  );
  assert.equal(missing.status, 404);
});

test("review: rejects an unknown status, a missing proofHash and an over-long note", async () => {
  revenuecat("entitled");
  const hash = "d4".repeat(32);
  upsertProof(payload(hash));

  assert.equal(
    (await post("/coordinator/review", { proofHash: hash, status: "approved" }, asCoordinator)).status,
    400,
  );
  assert.equal((await post("/coordinator/review", { status: "accepted" }, asCoordinator)).status, 400);
  assert.equal(
    (
      await post(
        "/coordinator/review",
        { proofHash: hash, status: "accepted", note: "x".repeat(501) },
        asCoordinator,
      )
    ).status,
    413,
  );
  assert.equal(getProof(hash)!.review, undefined, "no rejected request may write a verdict");
});

test("review state and notes NEVER appear on a public route", async () => {
  revenuecat("entitled");
  const hash = "e5".repeat(32);
  await post("/sync", signPayload(payload(hash), kp.privateKey));
  await post(
    "/coordinator/review",
    { proofHash: hash, status: "rejected", note: "SECRET-TRIAGE-NOTE" },
    asCoordinator,
  );

  for (const path of ["/proof/" + hash, "/proofs"]) {
    const body = await (await app.request(path)).text();
    assert.ok(!body.includes("SECRET-TRIAGE-NOTE"), "note leaked on " + path);
    assert.ok(!body.toLowerCase().includes("review"), "review state leaked on " + path);
  }
});

test("the coordinator view carries no identity, precise location, signature or public key", async () => {
  revenuecat("entitled");
  const hash = "f6".repeat(32);
  await post("/sync", signPayload(payload(hash), kp.privateKey));
  await post("/precise-location", { proofHash: hash, cipher: "00ff00ff" });

  const body = await (await get("/coordinator/reports", asCoordinator)).text();
  for (const forbidden of ["signature", "publicKey", "preciseLocation", "cipher", "mediaUri", USER, SECRET]) {
    assert.ok(!body.includes(forbidden), forbidden + " leaked to the coordinator view");
  }
});

test("export.csv: correct content type, header row, and RFC 4180 escaping of a hostile note", async () => {
  revenuecat("entitled");
  const hash = "07".repeat(32);
  upsertProof(payload(hash));
  const hostile = 'has,comma "quote" and\nnewline';
  await post("/coordinator/review", { proofHash: hash, status: "accepted", note: hostile }, asCoordinator);

  const res = await get("/coordinator/export.csv", asCoordinator);
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type") ?? "", /text\/csv/);

  const csv = await res.text();
  assert.equal(
    csv.split("\r\n")[0],
    "proofHash,taskId,geohashRegion,capturedAt,attestationCount,reviewStatus,reviewNote,reviewedAt",
  );
  assert.ok(
    csv.includes('"has,comma ""quote"" and\nnewline"'),
    "the note must be quoted and its inner quotes doubled",
  );
});

test("toCsv is pure: a cell with every delimiter is quoted and its quotes doubled", () => {
  const row: CoordinatorRow = {
    proofHash: "a".repeat(64),
    taskId: 'task,"with"\r\nbreaks',
    geohashRegion: "9q8yy",
    capturedAt: "2026-09-06T14:32:00.000Z",
    attestationCount: 2,
    reviewStatus: "accepted",
    reviewNote: "",
    reviewedAt: "2026-09-21T00:00:00.000Z",
  };
  const csv = toCsv([row]);
  assert.equal(
    csv.split("\r\n")[0],
    "proofHash,taskId,geohashRegion,capturedAt,attestationCount,reviewStatus,reviewNote,reviewedAt",
  );
  assert.ok(csv.includes('"task,""with""\r\nbreaks"'));
});

test("gate: secret key set but REVENUECAT_PROJECT_ID missing => 503, never 402", async () => {
  process.env.REVENUECAT_SECRET_KEY = SECRET;
  delete process.env.REVENUECAT_PROJECT_ID;
  const res = await get("/coordinator/reports", asCoordinator);
  assert.equal(res.status, 503, "a misconfigured server must not look like an unpaid customer");
});
