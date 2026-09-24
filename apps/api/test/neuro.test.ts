// neuro.test.ts: unit + fuzz + invariant coverage for the Neuro verified-attribute client.
// Core guarantee under test: only { attribute, value:boolean } leaves getVerifiedAttribute,
// it degrades (never throws) when unconfigured or when the endpoint hangs, and no key from a
// hostile identity-shaped response body ever reaches the return value or the logs.

import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { getVerifiedAttribute } from "../src/neuro.js";

const realFetch = globalThis.fetch;
const realUrl = process.env.NEURO_AGENT_API_URL;
const realToken = process.env.NEURO_AGENT_API_TOKEN;

// env.* are live getters over process.env, so configuration is varied at the source.
function setEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

function configure(on: boolean): void {
  setEnv("NEURO_AGENT_API_URL", on ? "https://neuro.example/agent" : "");
  setEnv("NEURO_AGENT_API_TOKEN", on ? "secret-token-value" : "");
}

// Capture everything written to the console during a call, as one flat string.
async function withCapturedLogs<T>(fn: () => Promise<T>): Promise<{ result: T; logs: string }> {
  const chunks: string[] = [];
  const sink = (...args: unknown[]): void => {
    chunks.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
  };
  const c = console as unknown as Record<string, (...a: unknown[]) => void>;
  const originals = { log: c.log, info: c.info, warn: c.warn, error: c.error, debug: c.debug };
  c.log = c.info = c.warn = c.error = c.debug = sink;
  try {
    const result = await fn();
    return { result, logs: chunks.join("\n") };
  } finally {
    Object.assign(c, originals);
  }
}

afterEach(() => {
  globalThis.fetch = realFetch;
  setEnv("NEURO_AGENT_API_URL", realUrl);
  setEnv("NEURO_AGENT_API_TOKEN", realToken);
});

// --- unit ---------------------------------------------------------------

test("unconfigured env => available:false, no throw, no data", async () => {
  configure(false);
  const r = await getVerifiedAttribute({ attribute: "age_majority" });
  assert.equal(r.available, false);
  assert.equal(r.source, "neuro");
  assert.equal(r.data, null);
  assert.match(r.error, /not configured/);
});

test("only NEURO_AGENT_API_TOKEN missing => still degrades", async () => {
  configure(true);
  setEnv("NEURO_AGENT_API_TOKEN", "");
  const r = await getVerifiedAttribute();
  assert.equal(r.available, false);
});

test("stubbed 200 => returns ONLY { attribute, value }", async () => {
  configure(true);
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ verified: true }), { status: 200 })) as typeof fetch;

  const r = await getVerifiedAttribute({ attribute: "age_majority" });
  assert.equal(r.available, true);
  assert.deepEqual(Object.keys(r.data).sort(), ["attribute", "value"]);
  assert.equal(r.data.attribute, "age_majority");
  assert.equal(r.data.value, true);
});

test("non-2xx => degrades, response body is not echoed into error", async () => {
  configure(true);
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ reason: "user 19800101 rejected", ssn: "123-45-6789" }), {
      status: 403,
    })) as typeof fetch;

  const r = await getVerifiedAttribute();
  assert.equal(r.available, false);
  assert.doesNotMatch(r.error, /1980|123-45-6789|ssn/i);
});

test("token is never placed in the returned object", async () => {
  configure(true);
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ verified: false }), { status: 200 })) as typeof fetch;
  const r = await getVerifiedAttribute();
  assert.doesNotMatch(JSON.stringify(r), /secret-token-value/);
});

// --- invariant: hostile identity-shaped body never leaks ----------------

const HOSTILE_BODY = {
  verified: true,
  value: true,
  // every one of these is a field that must NOT survive into the result or the logs
  fullName: "Jane Q. Volunteer",
  dateOfBirth: "1980-01-01",
  ssn: "123-45-6789",
  passportNumber: "X1234567",
  email: "jane@example.org",
  phone: "+46 70 123 4567",
  address: "Regeringsgatan 25, Stockholm",
  nationalId: "800101-1234",
  faceEmbedding: [0.1, 0.2, 0.3],
  rawToken: "secret-token-value",
  __proto__: { polluted: true },
};
const FORBIDDEN = Object.keys(HOSTILE_BODY).filter((k) => k !== "verified" && k !== "value");

test("invariant: no key from a hostile identity body leaks into the result or logs", async () => {
  configure(true);
  globalThis.fetch = (async () =>
    new Response(JSON.stringify(HOSTILE_BODY), { status: 200 })) as typeof fetch;

  const { result: r, logs } = await withCapturedLogs(() => getVerifiedAttribute());
  assert.equal(r.available, true);

  const serialized = JSON.stringify(r);
  for (const key of FORBIDDEN) {
    assert.doesNotMatch(serialized, new RegExp(key, "i"), `result leaked key ${key}`);
  }
  for (const bad of ["Jane", "1980-01-01", "123-45-6789", "X1234567", "jane@example.org", "800101-1234"]) {
    assert.equal(serialized.includes(bad), false, `result leaked value ${bad}`);
    assert.equal(logs.includes(bad), false, `logs leaked value ${bad}`);
  }
  // structure is exactly the two allowed keys
  assert.deepEqual(Object.keys(r.data).sort(), ["attribute", "value"]);
});

// --- fuzz: random hostile bodies, random attributes ---------------------

function randToken(): string {
  return Math.random().toString(36).slice(2, 10);
}

test("fuzz: 300 random response bodies never leak an unexpected key", async () => {
  configure(true);
  for (let i = 0; i < 300; i++) {
    const noiseKeys = Array.from({ length: 1 + Math.floor(Math.random() * 6) }, () => randToken());
    const body: Record<string, unknown> = {};
    for (const k of noiseKeys) body[k] = Math.random() < 0.5 ? randToken() : Math.random();
    // sometimes include a truthy verified/value, sometimes not
    if (Math.random() < 0.6) body[Math.random() < 0.5 ? "verified" : "value"] = Math.random() < 0.5;
    const status = Math.random() < 0.8 ? 200 : 400 + Math.floor(Math.random() * 3);

    globalThis.fetch = (async () =>
      new Response(JSON.stringify(body), { status })) as typeof fetch;

    const attribute = `attr_${randToken()}`;
    const { result: r, logs } = await withCapturedLogs(() => getVerifiedAttribute({ attribute }));

    if (r.available) {
      assert.deepEqual(Object.keys(r.data).sort(), ["attribute", "value"], `iter ${i}`);
      assert.equal(r.data.attribute, attribute, `iter ${i}`);
      assert.equal(typeof r.data.value, "boolean", `iter ${i}`);
    } else {
      assert.equal(r.data, null, `iter ${i}`);
    }
    for (const k of noiseKeys) {
      assert.equal(JSON.stringify(r).includes(`"${k}"`), false, `iter ${i} leaked key ${k}`);
      assert.equal(logs.includes(k), false, `iter ${i} logged noise key ${k}`);
    }
  }
});

// --- timeout: a hung endpoint degrades within the 5s budget, never throws --

test("hung endpoint => degrades via abort within the timeout, never throws", async () => {
  configure(true);
  globalThis.fetch = ((_url: string, init?: RequestInit) =>
    new Promise((_resolve, reject) => {
      // Never resolves on its own. Reject only when the client aborts.
      init?.signal?.addEventListener("abort", () => {
        const err = new Error("aborted");
        err.name = "AbortError";
        reject(err);
      });
    })) as typeof fetch;

  const started = Date.now();
  const r = await getVerifiedAttribute();
  const elapsed = Date.now() - started;

  assert.equal(r.available, false);
  assert.equal(r.data, null);
  assert.ok(elapsed < 8000, `expected degrade within timeout budget, took ${elapsed}ms`);
});
