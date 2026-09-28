// entitlement.test.ts: server-side RevenueCat entitlement check (src/entitlement.ts).
// Degrades (never throws) when unconfigured or hung, reads exactly one boolean from the response,
// and the secret key never appears in the returned result or a thrown message.

import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { checkEntitlement } from "../src/entitlement.js";

const realFetch = globalThis.fetch;
const SECRET = "sk_test_super_secret_value";

const PROJECT = "proj1ab2c3d4";

function configure(on: boolean): void {
  process.env.REVENUECAT_SECRET_KEY = on ? SECRET : "";
  process.env.REVENUECAT_PROJECT_ID = on ? PROJECT : "";
}

afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.REVENUECAT_SECRET_KEY;
  delete process.env.REVENUECAT_API_BASE;
  delete process.env.REVENUECAT_PROJECT_ID;
});

test("unconfigured env => available:false, no throw, no data", async () => {
  configure(false);
  const r = await checkEntitlement("anon-user-1");
  assert.equal(r.available, false);
  assert.equal(r.source, "revenuecat");
  assert.equal(r.data, null);
  assert.match(r.error, /not configured/);
});

test("stubbed 200 with active coordinator_pro => entitled:true", async () => {
  configure(true);
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({ items: [{ entitlement_id: "coordinator_pro", expires_at: Date.now() + 100000 }] }),
      { status: 200 },
    )) as typeof fetch;

  const r = await checkEntitlement("anon-user-1");
  assert.equal(r.available, true);
  assert.deepEqual(r.data, { entitled: true });
});

test("stubbed 200 with no matching entitlement => entitled:false", async () => {
  configure(true);
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ items: [{ entitlement_id: "other_entitlement" }] }), { status: 200 })) as typeof fetch;

  const r = await checkEntitlement("anon-user-1");
  assert.equal(r.available, true);
  assert.deepEqual(r.data, { entitled: false });
});

test("expired entitlement => entitled:false", async () => {
  configure(true);
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({ items: [{ entitlement_id: "coordinator_pro", expires_at: Date.now() - 1000 }] }),
      { status: 200 },
    )) as typeof fetch;

  const r = await checkEntitlement("anon-user-1");
  assert.equal(r.available, true);
  assert.deepEqual(r.data, { entitled: false });
});

test("non-2xx => degrades, response body is not echoed into error", async () => {
  configure(true);
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ reason: "forbidden", secret: "leak-me" }), { status: 403 })) as typeof fetch;

  const r = await checkEntitlement("anon-user-1");
  assert.equal(r.available, false);
  assert.doesNotMatch(r.error, /leak-me/);
});

test("hung endpoint => degrades via abort within the timeout, never throws", async () => {
  configure(true);
  globalThis.fetch = ((_url: string, init?: RequestInit) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        const err = new Error("aborted");
        err.name = "AbortError";
        reject(err);
      });
    })) as typeof fetch;

  const started = Date.now();
  const r = await checkEntitlement("anon-user-1");
  const elapsed = Date.now() - started;

  assert.equal(r.available, false);
  assert.equal(r.data, null);
  assert.ok(elapsed < 8000, `expected degrade within timeout budget, took ${elapsed}ms`);
});

test("secret key never appears in the returned result, even on failure", async () => {
  configure(true);
  globalThis.fetch = (async () => new Response("nope", { status: 500 })) as typeof fetch;
  const r = await checkEntitlement("anon-user-1");
  assert.doesNotMatch(JSON.stringify(r), new RegExp(SECRET));
});

test("secret key never appears in a thrown message on a network failure", async () => {
  configure(true);
  globalThis.fetch = (async () => {
    throw new Error("network unreachable");
  }) as unknown as typeof fetch;
  const r = await checkEntitlement("anon-user-1");
  assert.equal(r.available, false);
  assert.doesNotMatch(JSON.stringify(r), new RegExp(SECRET));
});

test("calls the project-scoped v2 active_entitlements URL, Bearer-authorised", async () => {
  configure(true);
  const seen: { url: string; auth: string }[] = [];
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    seen.push({
      url: String(url),
      auth: String((init?.headers as Record<string, string> | undefined)?.authorization ?? ""),
    });
    return new Response(JSON.stringify({ object: "list", items: [] }), { status: 200 });
  }) as typeof fetch;

  await checkEntitlement("anon-user-1");

  assert.equal(seen.length, 1);
  // The v1-style /v2/customers/{id}/entitlements path does not exist and 404s in production.
  assert.equal(
    seen[0]!.url,
    `https://api.revenuecat.com/v2/projects/${PROJECT}/customers/anon-user-1/active_entitlements`,
  );
  assert.equal(seen[0]!.auth, `Bearer ${SECRET}`);
});

test("project id missing => typed unavailable, and no request is made", async () => {
  process.env.REVENUECAT_SECRET_KEY = SECRET;
  delete process.env.REVENUECAT_PROJECT_ID;
  let called = 0;
  globalThis.fetch = (async () => {
    called += 1;
    return new Response("{}", { status: 200 });
  }) as typeof fetch;

  const r = await checkEntitlement("anon-user-1");
  assert.equal(r.available, false);
  assert.match(r.error, /REVENUECAT_PROJECT_ID/);
  assert.equal(called, 0);
});

test("a customer id with URL-unsafe characters is encoded into the path", async () => {
  configure(true);
  const seen: string[] = [];
  globalThis.fetch = (async (url: string | URL) => {
    seen.push(String(url));
    return new Response(JSON.stringify({ object: "list", items: [] }), { status: 200 });
  }) as typeof fetch;

  await checkEntitlement("anon/user?with#chars");
  assert.ok(seen[0]!.endsWith("/customers/anon%2Fuser%3Fwith%23chars/active_entitlements"), seen[0]);
});

test("404 unknown customer => entitled:false and AVAILABLE (never purchased, not a degradation)", async () => {
  configure(true);
  // Live-verified 2026-09-21: a valid project with a customer RevenueCat has never seen returns
  // 404 resource_missing. Treating that as degraded would 503 every coordinator who opens the
  // app before subscribing, instead of showing them the paywall.
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({ type: "resource_missing", message: "Could not find customer ID associated with this project" }),
      { status: 404 },
    )) as typeof fetch;

  const r = await checkEntitlement("never-purchased-user");
  assert.equal(r.available, true, "an unknown customer is a definite answer, not an outage");
  assert.deepEqual(r.data, { entitled: false });
  assert.equal(r.error, null);
});

test("403 wrong project => DEGRADED, never a confident 'not entitled'", async () => {
  configure(true);
  // Live-verified 2026-09-21: a project the key cannot access returns 403 authorization_error.
  // This is the case that must stay degraded — a misconfigured server must not silently report
  // every paying customer as unsubscribed.
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({ type: "authorization_error", message: "The API key does not belong to the project." }),
      { status: 403 },
    )) as typeof fetch;

  const r = await checkEntitlement("anon-user-1");
  assert.equal(r.available, false);
  assert.equal(r.data, null);
});

test("401 bad key => degraded, and the key is never echoed in the error", async () => {
  configure(true);
  globalThis.fetch = (async () => new Response("{}", { status: 401 })) as typeof fetch;
  const r = await checkEntitlement("anon-user-1");
  assert.equal(r.available, false);
  assert.ok(!String(r.error).includes(SECRET));
});
