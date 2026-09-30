// owner-token.test.ts: /liveness-result and /precise-location are unauthenticated, write-once and
// keyed by a public proofHash, so only the device that first synced the proof may write. The same
// evidence token that gates /evidence proves it. REQUIRE_EVIDENCE_TOKEN turns a missing token into a
// refusal once every build in the field sends one; a wrong token is always refused.

import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { signPayload, generateKeyPair } from "@proof/core";
import { app } from "../src/index.js";
import { issueTicket } from "../src/liveness-ticket.js";

const kp = generateKeyPair();
const post = (path: string, body: unknown) =>
  app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const hex32 = () => randomBytes(32).toString("hex");
const sha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

/** A synced proof; with a token, its hash is registered on first sync like the app does. */
async function synced(token?: string): Promise<string> {
  const hash = hex32();
  const signed = signPayload(
    { proofHash: hash, taskId: "solar-panel-installation", geohash: "9q8yy", capturedAt: "2026-09-30T10:00:00.000Z" },
    kp.privateKey,
  );
  const res = await post("/sync", token ? { ...signed, evidenceTokenHash: sha(token) } : signed);
  assert.ok(res.status < 300, `sync ${res.status}`);
  return hash;
}

const verdict = async (hash: string) =>
  ((await (await app.request(`/proof/${hash}`)).json()) as { verifiedPerson: unknown }).verifiedPerson;

const pass = issueTicket({ verifiedPerson: true, degraded: false });
const fail = issueTicket({ verifiedPerson: false, degraded: false });

afterEach(() => {
  delete process.env.REQUIRE_EVIDENCE_TOKEN;
});

test("the device's own token records the verdict", async () => {
  const token = hex32();
  const hash = await synced(token);
  const res = await post("/liveness-result", { proofHash: hash, ticket: pass, evidenceToken: token });
  assert.equal(res.status, 200);
  assert.equal(await verdict(hash), true);
});

test("a stranger's token is refused, so a public hash cannot get someone else's verdict", async () => {
  const hash = await synced(hex32());
  const res = await post("/liveness-result", { proofHash: hash, ticket: pass, evidenceToken: hex32() });
  assert.equal(res.status, 403);
  assert.equal(await verdict(hash), null);
});

test("a stranger cannot lock out the real verdict by attaching a failed one first", async () => {
  process.env.REQUIRE_EVIDENCE_TOKEN = "true";
  const token = hex32();
  const hash = await synced(token);
  assert.equal((await post("/liveness-result", { proofHash: hash, ticket: fail })).status, 403);
  assert.equal((await post("/liveness-result", { proofHash: hash, ticket: pass, evidenceToken: token })).status, 200);
  assert.equal(await verdict(hash), true);
});

test("without the flag, a missing token still records (builds that do not send it yet)", async () => {
  const hash = await synced(hex32());
  const res = await post("/liveness-result", { proofHash: hash, ticket: pass });
  assert.equal(res.status, 200);
  assert.equal(await verdict(hash), true);
});

test("a proof synced with no token hash accepts the attach either way (nothing to prove against)", async () => {
  process.env.REQUIRE_EVIDENCE_TOKEN = "true";
  const hash = await synced();
  const res = await post("/liveness-result", { proofHash: hash, ticket: pass });
  assert.equal(res.status, 200);
});


test("/precise-location: the device's own token stores the sealed point", async () => {
  const token = hex32();
  const hash = await synced(token);
  const res = await post("/precise-location", { proofHash: hash, cipher: "aa".repeat(40), evidenceToken: token });
  assert.equal(res.status, 200);
});

test("/precise-location: a stranger cannot plant a point, even one sealed to the public programme key", async () => {
  const token = hex32();
  const hash = await synced(token);
  const fake = await post("/precise-location", { proofHash: hash, cipher: "bb".repeat(40), evidenceToken: hex32() });
  assert.equal(fake.status, 403);
  // The real point is not locked out by the refused write.
  const real = await post("/precise-location", { proofHash: hash, cipher: "cc".repeat(40), evidenceToken: token });
  assert.equal(real.status, 200);
});

test("/precise-location: with the flag, a tokenless write is refused; without it, accepted", async () => {
  const hash = await synced(hex32());
  process.env.REQUIRE_EVIDENCE_TOKEN = "true";
  assert.equal((await post("/precise-location", { proofHash: hash, cipher: "dd".repeat(40) })).status, 403);
  delete process.env.REQUIRE_EVIDENCE_TOKEN;
  assert.equal((await post("/precise-location", { proofHash: hash, cipher: "dd".repeat(40) })).status, 200);
});
