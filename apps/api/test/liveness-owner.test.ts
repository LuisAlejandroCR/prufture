// liveness-owner.test.ts: /liveness-result is unauthenticated and proof hashes are public, so the
// verdict must come from the device that first synced the proof. The same evidence token that gates
// /evidence proves it. LIVENESS_REQUIRE_TOKEN turns a missing token into a refusal once every build
// in the field sends one; a wrong token is always refused.

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
  delete process.env.LIVENESS_REQUIRE_TOKEN;
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
  process.env.LIVENESS_REQUIRE_TOKEN = "true";
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
  process.env.LIVENESS_REQUIRE_TOKEN = "true";
  const hash = await synced();
  const res = await post("/liveness-result", { proofHash: hash, ticket: pass });
  assert.equal(res.status, 200);
});
