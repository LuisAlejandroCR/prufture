// malformed-body.test.ts: every POST route answers a malformed body with a 4xx, never a 500.
// These routes are unauthenticated: a bad body is the caller's error, and a 500 would misreport
// whose fault it is and page an operator for traffic anyone can send.

import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPair, signPayload } from "@proof/core";
import { app } from "../src/index.js";

// /notify is for coordinators (401 before the body is read); notify-route.test.ts covers its body.
const POST_ROUTES = [
  "/sync",
  "/attest",
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

test("/notify: a caller-supplied recipient of any size is refused before it reaches a provider", async () => {
  // The recipient used to be relayed verbatim into a provider request; it is now fixed
  // server-side, and the route is for coordinators, so an anonymous `to` — oversized or not — is
  // refused (401) and never leaves the process. notify-route.test.ts covers a coordinator's `to`.
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

  for (const to of [`${"x".repeat(400)}@e.test`, "someone@example.org"]) {
    const res = await post("/notify", JSON.stringify({ proofHash, channel: "email", to }));
    assert.equal(res.status, 401);
  }
});
