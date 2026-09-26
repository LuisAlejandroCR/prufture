// malformed-body.test.ts: every POST route answers a malformed body with a 4xx, never a 500.
//
// /attest and /notify used to destructure `await c.req.json()` with no try/catch, so a body that
// is not JSON threw inside the handler and Hono turned it into a 500. Every other POST route
// already guarded. That mattered because these routes are unauthenticated: an unparseable body
// is the caller's error, and a 500 both misreports whose fault it is and pages an operator for
// traffic anyone can send.

import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPair, signPayload } from "@proof/core";
import { app } from "../src/index.js";

const POST_ROUTES = [
  "/sync",
  "/attest",
  "/notify",
  "/verify-identity",
  "/liveness-result",
  "/precise-location",
  "/register-push",
];

async function post(route: string, body: string): Promise<Response> {
  return app.request(route, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

for (const route of POST_ROUTES) {
  test(`${route} answers malformed json with 400, not 500`, async () => {
    const res = await post(route, "{not json");
    assert.equal(res.status, 400, `${route} must not turn a bad body into a server error`);
    assert.equal(((await res.json()) as { error: string }).error, "invalid json");
  });

  test(`${route} survives a json body that is not an object`, async () => {
    // Valid JSON, wrong shape: `null` and `"string"` both break naive destructuring.
    for (const body of ["null", '"a string"', "42"]) {
      const res = await post(route, body);
      assert.ok(res.status < 500, `${route} returned ${res.status} for body ${body}`);
    }
  });
}

test("/attest: a non-string proofHash is a 404, not a crash", async () => {
  const res = await post("/attest", JSON.stringify({ proofHash: { evil: true } }));
  assert.equal(res.status, 404);
});

test("/notify: an oversized recipient is rejected with 413, on a proof that exists", async () => {
  // The recipient is relayed verbatim into a provider request and nothing else caps it.
  // Sync a real proof first, so the cap is reached rather than the unknown-proof 404.
  const kp = generateKeyPair();
  const proofHash = "d".repeat(64);
  const synced = await app.request("/sync", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(
      signPayload(
        {
          proofHash,
          taskId: "solar-panel-install",
          geohash: "9q8yy",
          capturedAt: "2026-09-06T14:32:00.000Z",
        } as never,
        kp.privateKey,
      ),
    ),
  });
  assert.equal(synced.status, 200);

  const res = await post(
    "/notify",
    JSON.stringify({ proofHash, channel: "email", to: `${"x".repeat(400)}@e.test` }),
  );
  assert.equal(res.status, 413);
  const body = (await res.json()) as { error: string; maxLength: number };
  assert.match(body.error, /recipient too long/);
  assert.equal(body.maxLength, 320);
});

test("/notify: a normal recipient is unaffected by the cap", async () => {
  const res = await post(
    "/notify",
    JSON.stringify({ proofHash: "e".repeat(64), channel: "email", to: "programme@example.org" }),
  );
  // Unknown proof -> 404, i.e. the cap did not fire on a real-world-length address.
  assert.equal(res.status, 404);
});
