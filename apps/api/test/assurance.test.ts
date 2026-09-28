// assurance.test.ts: the liveness port is DEFAULT OFF with only a `none` adapter, and no provider name
// can enable a vendor. The contract block runs a hostile adapter through the port, so a future vendor
// cannot widen what escapes the minimal { verifiedPerson } verdict or throw into the reporter's flow.

import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import type { ExternalResult } from "@proof/core";
import {
  checkLivenessVerdict,
  noneLiveness,
  selectedLivenessPort,
  type LivenessPort,
  type LivenessVerdict,
} from "../src/assurance.js";
import { app } from "../src/index.js";

afterEach(() => {
  delete process.env.LIVENESS_PROVIDER;
});

const FRAMES = { frames: ["ZnJhbWUx", "ZnJhbWUy"], nonceHex: "a".repeat(32), challenges: ["blink", "left"] };

function fakePort(check: LivenessPort["check"], configured: () => boolean = () => true): LivenessPort {
  return { name: "fake", isConfigured: configured, check };
}

test("with no configuration, liveness is none", () => {
  assert.equal(selectedLivenessPort().name, "none");
});

test("every provider name resolves to none, including the removed neuro", () => {
  for (const name of ["neuro", "rekognition", "iproov", "openid4vp", "mosip", "garbage", "NONE"]) {
    process.env.LIVENESS_PROVIDER = name;
    assert.equal(selectedLivenessPort().name, "none", `${name} must not enable liveness`);
  }
});

test("the none adapter degrades typed and names the off switch", async () => {
  const r = await checkLivenessVerdict(FRAMES);
  assert.equal(r.available, false);
  assert.equal(r.source, "liveness");
  assert.match(r.error ?? "", /LIVENESS_PROVIDER=none/);
  assert.equal(noneLiveness.isConfigured(), false);
});

test("liveness off still lets /verify-identity answer 200, degraded, with a ticket", async () => {
  const res = await app.request("/verify-identity", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(FRAMES),
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { verifiedPerson: boolean; degraded: boolean; ticket: string };
  assert.equal(body.verifiedPerson, false);
  assert.equal(body.degraded, true);
  assert.ok(body.ticket.length > 0);
});

test("the removed verified-attribute mode answers 400 and records nothing", async () => {
  const res = await app.request("/verify-identity", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ proofHash: "7e".repeat(32), attribute: "age_majority", subjectRef: "x" }),
  });
  assert.equal(res.status, 400);
  const body = (await res.json()) as Record<string, unknown>;
  assert.equal(body.error, "liveness frames required");
  assert.ok(!("verifiedAttribute" in body));
});

// Contract: what any future adapter must not be able to do through the port.

test("contract: a hostile response cannot escape the minimal verdict", async () => {
  const hostile = fakePort(async () =>
    ({
      available: true,
      source: "liveness",
      checkedAt: "now",
      error: null,
      data: { verifiedPerson: true, score: 0.98, sessionId: "sess-abc-123", nationalId: "12345678", frames: ["leaked"] },
    }) as unknown as ExternalResult<LivenessVerdict>,
  );
  const r = await checkLivenessVerdict(FRAMES, hostile);
  assert.equal(r.available, true);
  assert.deepEqual(r.data, { verifiedPerson: true }, "exactly one key may survive");
  const blob = JSON.stringify(r);
  for (const leak of ["sess-abc-123", "nationalId", "12345678", "0.98", "leaked"]) {
    assert.ok(!blob.includes(leak), `${leak} escaped the liveness boundary`);
  }
});

test("contract: a truthy non-boolean verdict is not a pass", async () => {
  const sloppy = fakePort(async () =>
    ({ available: true, source: "liveness", checkedAt: "now", error: null, data: { verifiedPerson: "yes" } }) as never,
  );
  const r = await checkLivenessVerdict(FRAMES, sloppy);
  assert.deepEqual(r.data, { verifiedPerson: false });
});

test("contract: a throwing adapter or configuration check degrades, never throws", async () => {
  const throwing = fakePort(async () => {
    throw new Error("network exploded");
  });
  const r = await checkLivenessVerdict(FRAMES, throwing);
  assert.equal(r.available, false);
  assert.equal(typeof r.checkedAt, "string");

  const brokenConfig = fakePort(async () => ({ available: true }) as never, () => {
    throw new Error("config exploded");
  });
  const c = await checkLivenessVerdict(FRAMES, brokenConfig);
  assert.equal(c.available, false);
  assert.match(c.error ?? "", /fake not configured/);
});

test("contract: a non-conforming result degrades instead of reaching the caller", async () => {
  const junk = fakePort(async () => ({ live: true }) as never);
  const r = await checkLivenessVerdict(FRAMES, junk);
  assert.equal(r.available, false);
  assert.match(r.error ?? "", /non-conforming/);
});
