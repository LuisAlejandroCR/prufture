// liveness.test.ts: the selfie liveness client — challenge shape, frame collection,
// guard-style degrade on a bad response, and the offline attach/retry buffer.
// Pure: fetch is injected, nothing native is imported.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  __pendingLiveness,
  __resetPendingLiveness,
  attachLiveness,
  flushPendingLiveness,
  newChallenge,
  runLiveness,
  submitLiveness,
} from "../src/liveness.js";

const okJson = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

test("newChallenge: 16-byte hex nonce and 3 known gestures", () => {
  const c = newChallenge();
  assert.match(c.nonceHex, /^[0-9a-f]{32}$/);
  assert.equal(c.sequence.length, 3);
  for (const g of c.sequence) assert.ok(["center", "left", "right", "blink"].includes(g));
});

test("runLiveness: one frame per step, nonce + sequence carried through", async () => {
  const seen: string[] = [];
  const res = await runLiveness({
    takeFrame: async () => "ZmFrZQ==",
    onStep: (g) => seen.push(g),
  });
  assert.equal(res.frames.length, 3);
  assert.equal(seen.length, 3);
  assert.match(res.nonceHex, /^[0-9a-f]{32}$/);
});

test("submitLiveness: passes verdict through; degrades on non-200 without throwing", async () => {
  const good = await submitLiveness(
    "http://api.test",
    { frames: ["a"], nonceHex: "x", sequence: ["center"] },
    async () => okJson({ verifiedPerson: true, degraded: false }),
  );
  assert.deepEqual(good, { verifiedPerson: true, degraded: false });

  const bad = await submitLiveness(
    "http://api.test",
    { frames: ["a"], nonceHex: "x", sequence: ["center"] },
    async () => new Response("nope", { status: 503 }),
  );
  assert.deepEqual(bad, { verifiedPerson: false, degraded: true });
});

test("attachLiveness buffers on failure; flushPendingLiveness clears it once the proof exists", async () => {
  __resetPendingLiveness();
  await attachLiveness("http://api.test", "hash1", true, async () => new Response("", { status: 404 }));
  assert.equal(__pendingLiveness().length, 1);

  await flushPendingLiveness("http://api.test", async () => new Response("", { status: 404 }));
  assert.equal(__pendingLiveness().length, 1, "still pending while the proof is unknown");

  await flushPendingLiveness("http://api.test", async () => okJson({ status: "recorded" }));
  assert.equal(__pendingLiveness().length, 0);
  __resetPendingLiveness();
});

test("attachLiveness sends only proofHash + verifiedPerson", async () => {
  __resetPendingLiveness();
  let sent: unknown;
  await attachLiveness("http://api.test", "hash2", false, async (_u, init) => {
    sent = JSON.parse(String(init?.body));
    return okJson({ status: "recorded" });
  });
  assert.deepEqual(sent, { proofHash: "hash2", verifiedPerson: false });
  assert.equal(__pendingLiveness().length, 0);
});
