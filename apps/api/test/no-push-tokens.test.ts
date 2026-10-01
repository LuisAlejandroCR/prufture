// no-push-tokens.test.ts: notices are worked out and shown on the phone (local notifications), so the
// api collects no push token: /register-push, which stored tokens nothing ever sent to, is gone.

import { test } from "node:test";
import assert from "node:assert/strict";
import { app } from "../src/index.js";

test("the api no longer collects push tokens", async () => {
  const res = await app.request("/register-push", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ deviceId: "a1b2c3d4e5f60718", token: "ExponentPushToken[abc]" }),
  });
  assert.equal(res.status, 404);
});
