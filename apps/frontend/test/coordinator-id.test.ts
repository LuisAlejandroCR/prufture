// coordinator-id.test.ts: a subscriber who sees the sample inbox can read and share their own
// coordinator id, so the programme team can add them as staff without digging in RevenueCat.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { coordinatorIdMessage } from "../src/coordinator-id.js";

test("the share message carries the id and what to do with it, nothing else", () => {
  const msg = coordinatorIdMessage("$RCAnonymousID:abc123");
  assert.match(msg, /\$RCAnonymousID:abc123/);
  assert.match(msg, /programme team/i);
  assert.doesNotMatch(msg, /[0-9a-f]{64}|geohash|location/i, "no report reference or place travels with it");
});

test("the sample inbox shows the id selectable and offers to share it", () => {
  const screen = readFileSync(new URL("../app/coordinator.tsx", import.meta.url), "utf8");
  assert.match(screen, /Your coordinator id/);
  assert.match(screen, /selectable/);
  assert.match(screen, /Share\.share\(\{ message: coordinatorIdMessage\(/);
  assert.match(screen, /label="Share my id"/);
});

test("joinProgramme posts the code and maps each answer", async () => {
  const { joinProgramme, APP_USER_HEADER } = await import("../src/coordinator-api.js");
  let seen: { url?: string; init?: RequestInit } = {};
  const answer = (status: number) =>
    (async (url: string, init?: RequestInit) => {
      seen = { url, init };
      return new Response("{}", { status });
    }) as unknown as typeof fetch;
  assert.equal(await joinProgramme("https://api.test/", "u1", " PILOT-CODE-1 ", answer(200)), "joined");
  assert.equal(seen.url, "https://api.test/coordinator/join");
  assert.equal(seen.init?.method, "POST");
  assert.equal((seen.init?.headers as Record<string, string>)[APP_USER_HEADER], "u1");
  assert.deepEqual(JSON.parse(String(seen.init?.body)), { code: "PILOT-CODE-1" });
  assert.equal(await joinProgramme("https://api.test", "u1", "x", answer(403)), "invalid");
  assert.equal(await joinProgramme("https://api.test", "u1", "x", answer(400)), "invalid");
  assert.equal(await joinProgramme("https://api.test", "u1", "x", answer(429)), "limited");
  assert.equal(await joinProgramme("https://api.test", "u1", "x", answer(503)), "unavailable");
  const throwing = (async () => {
    throw new Error("offline");
  }) as unknown as typeof fetch;
  assert.equal(await joinProgramme("https://api.test", "u1", "x", throwing), "unavailable");
});

test("the sample inbox offers to join with a programme code and reloads on success", () => {
  const screen = readFileSync(new URL("../app/coordinator.tsx", import.meta.url), "utf8");
  assert.match(screen, /accessibilityLabel="Programme code"/);
  assert.match(screen, /label="Join programme"/);
  assert.match(screen, /joinProgramme\(/);
  assert.match(screen, /if \(outcome === "joined"\) \{?\s*(void )?loadReports\(\)/);
});
