// public-writes.test.ts: the unauthenticated routes that write against a proof. Proof hashes are
// public (/proofs), so each of these must hold on its own against a caller who knows a hash:
//   - /liveness-result records only what a server-signed ticket says, never the body's claim;
//   - a liveness verdict and a sealed precise location are write-once;
//   - no route accepts an unbounded body.

import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { signPayload, generateKeyPair } from "@proof/core";
import { app, MAX_BODY_BYTES } from "../src/index.js";
import { issueTicket, readTicket, TICKET_TTL_MS } from "../src/liveness-ticket.js";

const kp = generateKeyPair();
const post = (path: string, body: unknown) =>
  app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

async function syncedProof(): Promise<string> {
  const proofHash = randomBytes(32).toString("hex");
  const res = await post(
    "/sync",
    signPayload({ proofHash, taskId: "solar-panel-install", geohash: "9q8yy", capturedAt: "2026-09-06T14:32:00.000Z" }, kp.privateKey),
  );
  assert.equal(res.status, 200);
  return proofHash;
}

async function verifiedPerson(hash: string): Promise<unknown> {
  return ((await (await app.request(`/proof/${hash}`)).json()) as { verifiedPerson: unknown }).verifiedPerson;
}

// --- the ticket itself -------------------------------------------------------------------------

test("a ticket round-trips its verdict", () => {
  assert.deepEqual(readTicket(issueTicket({ verifiedPerson: true, degraded: false })), { verifiedPerson: true, degraded: false });
  assert.deepEqual(readTicket(issueTicket({ verifiedPerson: false, degraded: true })), { verifiedPerson: false, degraded: true });
});

test("a ticket whose claims were edited is refused", () => {
  const [v, , sig] = issueTicket({ verifiedPerson: false, degraded: false }).split(".");
  const forgedBody = Buffer.from(JSON.stringify({ p: true, d: false, t: Date.now() })).toString("base64url");
  assert.equal(readTicket(`${v}.${forgedBody}.${sig}`), null);
});

test("garbage, wrong versions, oversized and non-string tickets are refused", () => {
  const good = issueTicket({ verifiedPerson: true, degraded: false });
  for (const t of [undefined, null, 42, {}, "", "v1.a.b", good.replace(/^v1/, "v2"), `${good}.x`, "x".repeat(10_000)]) {
    assert.equal(readTicket(t), null, `accepted ${String(t).slice(0, 20)}`);
  }
});

test("an expired ticket, or one issued in the future, is refused", () => {
  const now = Date.now();
  assert.equal(readTicket(issueTicket({ verifiedPerson: true, degraded: false }, now - TICKET_TTL_MS - 1), now), null);
  assert.equal(readTicket(issueTicket({ verifiedPerson: true, degraded: false }, now + 10 * 60_000), now), null);
  // Well inside the window, as an offline report syncing days later would be.
  assert.ok(readTicket(issueTicket({ verifiedPerson: true, degraded: false }, now - 7 * 86_400_000), now));
});

// --- /liveness-result ------------------------------------------------------------------------------

test("/liveness-result ignores a claimed verdict in the body and requires a ticket", async () => {
  const hash = await syncedProof();
  const res = await post("/liveness-result", { proofHash: hash, verifiedPerson: true });
  assert.equal(res.status, 400);
  assert.equal(await verifiedPerson(hash), null);
});

test("/liveness-result records the ticket's verdict even when the body claims otherwise", async () => {
  const hash = await syncedProof();
  const ticket = issueTicket({ verifiedPerson: false, degraded: true });
  const res = await post("/liveness-result", { proofHash: hash, ticket, verifiedPerson: true, degraded: false });
  assert.equal(res.status, 200);
  assert.equal(await verifiedPerson(hash), false);
});

test("/verify-identity issues a ticket that /liveness-result accepts", async () => {
  const hash = await syncedProof();
  const checked = (await (
    await post("/verify-identity", { frames: ["ZmFrZQ=="], nonceHex: "00".repeat(16), challenges: ["center"] })
  ).json()) as { verifiedPerson: boolean; degraded: boolean; ticket: string };
  assert.equal(typeof checked.ticket, "string");
  assert.deepEqual(readTicket(checked.ticket), { verifiedPerson: checked.verifiedPerson, degraded: checked.degraded });
  assert.equal((await post("/liveness-result", { proofHash: hash, ticket: checked.ticket })).status, 200);
});

test("a recorded liveness verdict cannot be replaced by a different one", async () => {
  const hash = await syncedProof();
  const fail = issueTicket({ verifiedPerson: false, degraded: false });
  const pass = issueTicket({ verifiedPerson: true, degraded: false });
  assert.equal((await post("/liveness-result", { proofHash: hash, ticket: fail })).status, 200);
  assert.equal((await post("/liveness-result", { proofHash: hash, ticket: pass })).status, 409);
  assert.equal(await verifiedPerson(hash), false);
});

// --- /precise-location -------------------------------------------------------------------------------

test("a stored precise location cannot be replaced, but an identical retry is accepted", async () => {
  const hash = await syncedProof();
  assert.equal((await post("/precise-location", { proofHash: hash, cipher: "00ff00ff" })).status, 200);
  assert.equal((await post("/precise-location", { proofHash: hash, cipher: "00ff00ff" })).status, 200);
  assert.equal((await post("/precise-location", { proofHash: hash, cipher: "deadbeef" })).status, 409);
});

// --- body size -------------------------------------------------------------------------------------

test("an oversized body is refused with 413 before any route reads it", async () => {
  const big = JSON.stringify({ proofHash: "a".repeat(64), pad: "x".repeat(MAX_BODY_BYTES) });
  for (const route of ["/sync", "/attest", "/notify", "/liveness-result", "/precise-location", "/register-push"]) {
    assert.equal((await post(route, big)).status, 413, route);
  }
});

test("/verify-identity accepts liveness frames far above the general cap", async () => {
  const frame = "A".repeat(400 * 1024); // roughly one camera frame at quality 0.3, base64
  const res = await post("/verify-identity", { frames: [frame, frame, frame], nonceHex: "00".repeat(16), challenges: ["center"] });
  assert.equal(res.status, 200);
});
