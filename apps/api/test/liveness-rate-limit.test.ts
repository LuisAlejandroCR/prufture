// liveness-rate-limit.test.ts: the spend guard on POST /liveness/session — per-IP token bucket,
// global daily cap from LIVENESS_SESSION_DAILY_CAP, typed-degraded 429 with Retry-After, and that
// a refused call never reaches the provider.

import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { app } from "../src/index.js";
import { overrideLivenessSessionPortForTests } from "../src/assurance.js";
import { createAwsLiveness, type FaceLivenessClient } from "../src/liveness-aws.js";
import {
  BUCKET_CAPACITY,
  DEFAULT_DAILY_CAP,
  REFILL_MS,
  clientKey,
  dailyCap,
  resetLivenessRateLimitForTests,
  takeLivenessSessionSlot,
  trustedProxyHops,
} from "../src/liveness-rate-limit.js";
import { resetLivenessSessionsForTests } from "../src/liveness-sessions.js";

const SESSION = "0f8fad5b-d9cb-469f-a165-70867728950e";
const CONFIGURED = { AWS_REGION: "eu-west-1", AWS_ACCESS_KEY_ID: "AKIATEST", AWS_SECRET_ACCESS_KEY: "test-secret" };

function counting() {
  let creates = 0;
  const client: FaceLivenessClient = {
    async createSession() {
      creates += 1;
      return { SessionId: SESSION };
    },
    async getResults() {
      return { Status: "SUCCEEDED", Confidence: 99 };
    },
  };
  overrideLivenessSessionPortForTests(createAwsLiveness({ client, env: CONFIGURED }));
  return () => creates;
}

const open = (ip?: string) =>
  app.request("/liveness/session", { method: "POST", headers: ip ? { "x-forwarded-for": ip } : {} });

afterEach(() => {
  overrideLivenessSessionPortForTests(undefined);
  resetLivenessRateLimitForTests();
  resetLivenessSessionsForTests();
  delete process.env.LIVENESS_SESSION_DAILY_CAP;
  delete process.env.TRUSTED_PROXY_HOPS;
});

test("per-IP bucket: a burst of BUCKET_CAPACITY, then 429 degraded with Retry-After, and AWS is not called", async () => {
  const creates = counting();
  for (let i = 0; i < BUCKET_CAPACITY; i++) assert.equal((await open("203.0.113.7")).status, 200, `call ${i}`);
  const refused = await open("203.0.113.7");
  assert.equal(refused.status, 429);
  assert.deepEqual(await refused.json(), { error: "liveness rate limited", degraded: true });
  const retry = Number(refused.headers.get("retry-after"));
  assert.ok(retry > 0 && retry <= REFILL_MS / 1000, `retry-after ${retry}`);
  assert.equal(creates(), BUCKET_CAPACITY, "a refused call never opens a paid session");

  // Another caller has its own bucket.
  assert.equal((await open("198.51.100.9")).status, 200);
});

test("per-IP bucket refills one slot per REFILL_MS and never above capacity", () => {
  const t0 = 1_000_000_000_000;
  for (let i = 0; i < BUCKET_CAPACITY; i++) assert.equal(takeLivenessSessionSlot("a", t0).ok, true);
  const empty = takeLivenessSessionSlot("a", t0);
  assert.deepEqual(empty, { ok: false, reason: "ip", retryAfterSec: REFILL_MS / 1000 });
  assert.equal(takeLivenessSessionSlot("a", t0 + REFILL_MS - 1).ok, false);
  assert.equal(takeLivenessSessionSlot("a", t0 + REFILL_MS).ok, true);
  assert.equal(takeLivenessSessionSlot("a", t0 + REFILL_MS).ok, false);

  // A day idle refills to capacity, not beyond.
  const later = t0 + 24 * 60 * 60 * 1000;
  for (let i = 0; i < BUCKET_CAPACITY; i++) assert.equal(takeLivenessSessionSlot("a", later).ok, true);
  assert.equal(takeLivenessSessionSlot("a", later).ok, false);
});

test("daily cap: LIVENESS_SESSION_DAILY_CAP bounds every caller together, 429 degraded, resets next UTC day", async () => {
  process.env.LIVENESS_SESSION_DAILY_CAP = "3";
  const creates = counting();
  assert.equal((await open("203.0.113.1")).status, 200);
  assert.equal((await open("203.0.113.2")).status, 200);
  assert.equal((await open("203.0.113.3")).status, 200);
  const refused = await open("203.0.113.4");
  assert.equal(refused.status, 429);
  assert.deepEqual(await refused.json(), { error: "liveness rate limited", degraded: true });
  assert.ok(Number(refused.headers.get("retry-after")) <= 24 * 60 * 60);
  assert.equal(creates(), 3);

  resetLivenessRateLimitForTests();
  const day = 24 * 60 * 60 * 1000;
  const t0 = 20_000 * day + 5;
  for (let i = 0; i < 3; i++) assert.equal(takeLivenessSessionSlot(`ip${i}`, t0).ok, true);
  const capped = takeLivenessSessionSlot("fresh", t0);
  assert.deepEqual(capped, { ok: false, reason: "daily", retryAfterSec: Math.ceil((day - 5) / 1000) });
  assert.equal(takeLivenessSessionSlot("fresh", t0 + day).ok, true, "a new UTC day opens the cap again");
});

test("daily cap of 0 closes the route; a refusal by the cap does not drain the caller's bucket", () => {
  const env = { LIVENESS_SESSION_DAILY_CAP: "0" };
  for (let i = 0; i < BUCKET_CAPACITY + 2; i++) assert.equal(takeLivenessSessionSlot("a", 0, env).ok, false);
  // The same caller, once the cap allows it, still has a full burst.
  for (let i = 0; i < BUCKET_CAPACITY; i++) assert.equal(takeLivenessSessionSlot("a", 0, { LIVENESS_SESSION_DAILY_CAP: "1000" }).ok, true);
});

test("liveness off answers 503 before the guard and never spends a slot", async () => {
  for (let i = 0; i < BUCKET_CAPACITY + 3; i++) assert.equal((await open("203.0.113.7")).status, 503);
  counting();
  assert.equal((await open("203.0.113.7")).status, 200);
});

test("dailyCap and trustedProxyHops ignore junk", () => {
  assert.equal(dailyCap({}), DEFAULT_DAILY_CAP);
  assert.equal(dailyCap({ LIVENESS_SESSION_DAILY_CAP: "50" }), 50);
  assert.equal(dailyCap({ LIVENESS_SESSION_DAILY_CAP: "0" }), 0);
  for (const bad of ["abc", "-1", "1.5", "Infinity", " "]) assert.equal(dailyCap({ LIVENESS_SESSION_DAILY_CAP: bad }), DEFAULT_DAILY_CAP, bad);
  assert.equal(trustedProxyHops({}), 1);
  assert.equal(trustedProxyHops({ TRUSTED_PROXY_HOPS: "2" }), 2);
  for (const bad of ["0", "-1", "abc", "99"]) assert.equal(trustedProxyHops({ TRUSTED_PROXY_HOPS: bad }), 1, bad);
});

test("clientKey counts from the right, so a spoofed left-hand X-Forwarded-For entry cannot pick the bucket", () => {
  assert.equal(clientKey(undefined, 1), "unknown");
  assert.equal(clientKey("", 1), "unknown");
  assert.equal(clientKey("203.0.113.7", 1), "203.0.113.7");
  assert.equal(clientKey("1.1.1.1, 203.0.113.7", 1), "203.0.113.7");
  assert.equal(clientKey("1.1.1.1, 203.0.113.7, 10.0.0.1", 2), "203.0.113.7");
  assert.equal(clientKey("203.0.113.7", 3), "203.0.113.7");
});

test("route: a rotating spoofed X-Forwarded-For prefix still lands in one bucket", async () => {
  counting();
  for (let i = 0; i < BUCKET_CAPACITY; i++) assert.equal((await open(`10.9.9.${i}, 203.0.113.7`)).status, 200);
  assert.equal((await open("10.9.9.200, 203.0.113.7")).status, 429);
});
