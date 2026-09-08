// liveness.test.ts: the selfie liveness verdict path — /verify-identity (frames mode),
// /liveness-result, and the verifiedPerson field on /proof/:hash. Neuro is unconfigured
// in the test env, so the provider call always degrades. Also asserts no frame / nonce /
// identity field is ever echoed back in a response.

import { test } from "node:test";
import assert from "node:assert/strict";
import { signPayload, generateKeyPair } from "@proof/core";
import { app } from "../src/index.js";

const kp = generateKeyPair();
const post = (path: string, body: unknown) =>
  app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const payload = (hash: string) => ({
  proofHash: hash,
  taskId: "solar-panel-installation",
  geohash: "9q8yyk8yuv",
  capturedAt: "2026-09-06T14:32:00.000Z",
});

test("/verify-identity in frames mode degrades to { verifiedPerson:false, degraded:true } 200", async () => {
  const res = await post("/verify-identity", {
    frames: ["ZmFrZQ==", "ZmFrZQ==", "ZmFrZQ=="],
    nonceHex: "00112233445566778899aabbccddeeff",
    challenges: ["center", "left", "blink"],
  });
  assert.equal(res.status, 200);
  const j = (await res.json()) as { verifiedPerson: boolean; degraded: boolean };
  assert.equal(j.verifiedPerson, false);
  assert.equal(j.degraded, true);
});

test("/liveness-result: 404 for an unknown proof, records for a known one, idempotent", async () => {
  const unknown = await post("/liveness-result", { proofHash: "a".repeat(64), verifiedPerson: true });
  assert.equal(unknown.status, 404);

  const hash = "b".repeat(64);
  await post("/sync", signPayload(payload(hash), kp.privateKey));

  const first = await post("/liveness-result", { proofHash: hash, verifiedPerson: true });
  assert.equal(first.status, 200);
  const again = await post("/liveness-result", { proofHash: hash, verifiedPerson: true });
  assert.equal(again.status, 200);

  const proof = await app.request(`/proof/${hash}`);
  const pj = (await proof.json()) as { verifiedPerson: unknown };
  assert.equal(pj.verifiedPerson, true);
});

test("/proof/:hash verifiedPerson is null until a result is attached", async () => {
  const hash = "c".repeat(64);
  await post("/sync", signPayload(payload(hash), kp.privateKey));
  const proof = await app.request(`/proof/${hash}`);
  const pj = (await proof.json()) as { verifiedPerson: unknown };
  assert.equal(pj.verifiedPerson, null);
});

test("no response in the liveness path echoes a frame, nonce, score, or identity field", async () => {
  const hash = "d".repeat(64);
  await post("/sync", signPayload(payload(hash), kp.privateKey));
  const bodies: string[] = [];
  bodies.push(
    await (
      await post("/verify-identity", {
        frames: ["ZmFrZQ=="],
        nonceHex: "deadbeefdeadbeefdeadbeefdeadbeef",
        challenges: ["center"],
      })
    ).text(),
  );
  bodies.push(await (await post("/liveness-result", { proofHash: hash, verifiedPerson: true })).text());
  bodies.push(await (await app.request(`/proof/${hash}`)).text());

  for (const b of bodies) {
    for (const bad of ["frame", "nonce", "providerRef", "embedding", "score", "sessionId", "face"]) {
      assert.ok(!b.toLowerCase().includes(bad.toLowerCase()), `"${bad}" leaked in: ${b}`);
    }
  }
});
