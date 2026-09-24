// assurance.test.ts: phase 3 of the provider portability plan. Liveness and verified attributes
// are separate ports with separate adapters, BOTH DEFAULT OFF.
//
// The contract block at the bottom is the plan's exit criterion: the same assertions run
// unchanged against every adapter, so adding one cannot widen what escapes the boundary.

import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { signPayload, generateKeyPair } from "@proof/core";
import {
  checkLivenessVerdict,
  fetchVerifiedAttribute,
  neuroAttribute,
  neuroLiveness,
  noneAttribute,
  noneLiveness,
  selectedAttributePort,
  selectedLivenessPort,
  type AttributePort,
  type LivenessPort,
} from "../src/assurance.js";
import { app } from "../src/index.js";

const PROVIDER_KEYS = ["LIVENESS_PROVIDER", "ATTRIBUTE_PROVIDER"];
const realFetch = globalThis.fetch;
const realNeuroUrl = process.env.NEURO_AGENT_API_URL;
const realNeuroToken = process.env.NEURO_AGENT_API_TOKEN;

// env.* are live getters over process.env, so configuration is varied at the source.
function setEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

function credentials(on: boolean): void {
  setEnv("NEURO_AGENT_API_URL", on ? "https://neuro.example/agent" : "");
  setEnv("NEURO_AGENT_API_TOKEN", on ? "secret-token-value" : "");
}

afterEach(() => {
  globalThis.fetch = realFetch;
  for (const k of PROVIDER_KEYS) delete process.env[k];
  setEnv("NEURO_AGENT_API_URL", realNeuroUrl);
  setEnv("NEURO_AGENT_API_TOKEN", realNeuroToken);
});

const FRAMES = { frames: ["ZnJhbWUx", "ZnJhbWUy"], nonceHex: "a".repeat(32), challenges: ["blink", "left"] };

// --- both ports default off ---------------------------------------------------------------

test("with no configuration at all, both ports are none", () => {
  assert.equal(selectedLivenessPort().name, "none");
  assert.equal(selectedAttributePort().name, "none");
});

test("setting only the vendor credentials does NOT enable either port", () => {
  credentials(true);
  assert.equal(selectedLivenessPort().name, "none", "credentials alone must not switch liveness on");
  assert.equal(selectedAttributePort().name, "none", "credentials alone must not switch attributes on");
});

test("an unknown provider name fails closed to none", () => {
  for (const name of ["rekognition", "openid4vp", "mosip", "garbage", "NEURO"]) {
    process.env.LIVENESS_PROVIDER = name;
    process.env.ATTRIBUTE_PROVIDER = name;
    assert.equal(selectedLivenessPort().name, "none", `${name} must not enable liveness`);
    assert.equal(selectedAttributePort().name, "none", `${name} must not enable attributes`);
  }
});

test("the ports are selected independently", () => {
  process.env.LIVENESS_PROVIDER = "neuro";
  assert.equal(selectedLivenessPort().name, "neuro");
  assert.equal(selectedAttributePort().name, "none", "a liveness vendor is not an attribute issuer");
});

test("selecting neuro without credentials still degrades typed, never throws", async () => {
  process.env.LIVENESS_PROVIDER = "neuro";
  process.env.ATTRIBUTE_PROVIDER = "neuro";
  const l = await checkLivenessVerdict(FRAMES);
  const a = await fetchVerifiedAttribute({ attribute: "age_majority" });
  assert.equal(l.available, false);
  assert.equal(a.available, false);
  assert.match(l.error ?? "", /not configured/);
  assert.match(a.error ?? "", /not configured/);
});

// --- unavailable assurance never blocks the report ------------------------------------------

test("a disabled liveness port still lets /verify-identity answer 200, degraded", async () => {
  const res = await app.request("/verify-identity", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(FRAMES),
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { verifiedPerson: boolean; degraded: boolean };
  assert.equal(body.verifiedPerson, false);
  assert.equal(body.degraded, true);
});

test("a disabled attribute port leaves the proof intact and answers 200 degraded", async () => {
  const kp = generateKeyPair();
  const payload = {
    // distinct from the hashes liveness.test.ts uses: the store is shared across the suite
    proofHash: "7e".repeat(32),
    taskId: "solar-panel-installation",
    geohash: "9q8yy",
    capturedAt: "2026-09-06T14:32:00.000Z",
  };
  // signPayload returns the whole signed body (payload + publicKey + signature), not a signature.
  const sync = await app.request("/sync", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(signPayload(payload, kp.privateKey)),
  });
  assert.equal(sync.status, 200, "capture path is unaffected by assurance being off");

  const res = await app.request("/verify-identity", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ proofHash: payload.proofHash, attribute: "age_majority" }),
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { status: string; verifiedAttribute: unknown };
  assert.equal(body.status, "degraded");
  assert.equal(body.verifiedAttribute, null);
});

// --- contract tests: identical for EVERY adapter ---------------------------------------------

const LIVENESS_ADAPTERS: LivenessPort[] = [noneLiveness, neuroLiveness];
const ATTRIBUTE_ADAPTERS: AttributePort[] = [noneAttribute, neuroAttribute];

for (const port of LIVENESS_ADAPTERS) {
  test(`contract [liveness/${port.name}]: a hostile response cannot escape the minimal verdict`, async () => {
    credentials(true);
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          live: true,
          score: 0.98,
          sessionId: "sess-abc-123",
          faceEmbedding: [0.1, 0.2],
          nationalId: "12345678",
          frames: ["leaked"],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      )) as typeof fetch;

    const r = await port.check(FRAMES);
    if (!r.available) {
      assert.equal(r.data, null);
      // Guard against this contract test going vacuous: only the off adapter may degrade here.
      assert.equal(port.name, "none", "a configured adapter must reach the real response path");
      return;
    }
    assert.deepEqual(Object.keys(r.data), ["verifiedPerson"], "exactly one key may survive");
    assert.equal(typeof r.data.verifiedPerson, "boolean");
    const blob = JSON.stringify(r);
    for (const leak of ["sess-abc-123", "faceEmbedding", "nationalId", "12345678", "0.98", "leaked"]) {
      assert.ok(!blob.includes(leak), `${leak} escaped the ${port.name} liveness boundary`);
    }
  });

  test(`contract [liveness/${port.name}]: never throws, always a typed envelope`, async () => {
    globalThis.fetch = (async () => {
      throw new Error("network exploded");
    }) as typeof fetch;
    const r = await port.check(FRAMES);
    assert.equal(typeof r.available, "boolean");
    assert.equal(typeof r.source, "string");
    assert.equal(typeof r.checkedAt, "string");
  });
}

for (const port of ATTRIBUTE_ADAPTERS) {
  test(`contract [attribute/${port.name}]: only { attribute, value } escapes`, async () => {
    credentials(true);
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          verified: true,
          dateOfBirth: "1990-04-01",
          fullName: "A Real Person",
          documentNumber: "X9988776",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      )) as typeof fetch;

    const r = await port.get({ attribute: "age_majority" });
    if (!r.available) {
      assert.equal(r.data, null);
      // Guard against this contract test going vacuous: only the off adapter may degrade here.
      assert.equal(port.name, "none", "a configured adapter must reach the real response path");
      return;
    }
    assert.deepEqual(Object.keys(r.data).sort(), ["attribute", "value"]);
    assert.equal(typeof r.data.value, "boolean");
    const blob = JSON.stringify(r);
    for (const leak of ["1990-04-01", "A Real Person", "X9988776"]) {
      assert.ok(!blob.includes(leak), `${leak} escaped the ${port.name} attribute boundary`);
    }
  });

  test(`contract [attribute/${port.name}]: never throws, always a typed envelope`, async () => {
    globalThis.fetch = (async () => {
      throw new Error("network exploded");
    }) as typeof fetch;
    const r = await port.get({ attribute: "age_majority" });
    assert.equal(typeof r.available, "boolean");
    assert.equal(typeof r.source, "string");
    assert.equal(typeof r.checkedAt, "string");
  });
}
