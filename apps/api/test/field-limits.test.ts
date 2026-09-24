// field-limits.test.ts: /sync caps the signed public-payload fields.
//
// taskId and capturedAt are inside the SIGNED payload, but the signature comes from a
// self-generated key — there is no registration, so anyone can produce a valid one. Those fields
// then travel into EAS calldata, which the relayer pays gas for PER BYTE, and into the durable
// store. Without a cap, an unauthenticated caller can spend the programme's gas-only key at will
// and grow the store file without limit.
//
// A signed field cannot be trimmed without invalidating the signature — the same constraint the
// geohash check faces — so an oversized field must be REJECTED, and the proof must not be stored.

import { test } from "node:test";
import assert from "node:assert/strict";
import { signPayload, generateKeyPair, MAX_TASK_ID_LEN, MAX_CAPTURED_AT_LEN } from "@proof/core";
import { app } from "../src/index.js";
import { getProof } from "../src/store.js";

const kp = generateKeyPair();

function hash(seed: string): string {
  return seed.repeat(64).slice(0, 64);
}

async function sync(payload: Record<string, unknown>): Promise<Response> {
  return app.request("/sync", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(signPayload(payload as never, kp.privateKey)),
  });
}

function base(h: string): Record<string, unknown> {
  return { proofHash: h, taskId: "solar-panel-install", geohash: "9q8yy", capturedAt: "2026-09-06T14:32:00.000Z" };
}

test("an oversized taskId is rejected with 413 and never stored", async () => {
  const h = hash("1");
  const res = await sync({ ...base(h), taskId: "a".repeat(MAX_TASK_ID_LEN + 1) });
  assert.equal(res.status, 413);
  const body = (await res.json()) as { error: string; maxLength: number };
  assert.match(body.error, /taskId too long/);
  assert.equal(body.maxLength, MAX_TASK_ID_LEN);
  assert.equal(getProof(h), undefined, "a rejected proof must not reach the store");
});

test("a grossly oversized taskId — the gas-griefing case — is rejected", async () => {
  const h = hash("2");
  const res = await sync({ ...base(h), taskId: "A".repeat(100_000) });
  assert.equal(res.status, 413);
  assert.equal(getProof(h), undefined);
});

test("an oversized capturedAt is rejected", async () => {
  const h = hash("3");
  const res = await sync({ ...base(h), capturedAt: `2026-09-06T14:32:00.000Z${" ".repeat(MAX_CAPTURED_AT_LEN)}` });
  assert.equal(res.status, 413);
  assert.match(((await res.json()) as { error: string }).error, /capturedAt too long/);
  assert.equal(getProof(h), undefined);
});

test("a taskId exactly at the cap is accepted", async () => {
  const h = hash("4");
  const taskId = "b".repeat(MAX_TASK_ID_LEN);
  assert.equal((await sync({ ...base(h), taskId })).status, 200);
  assert.equal(getProof(h)?.payload.taskId, taskId);
});

test("a real taskId is unaffected", async () => {
  const h = hash("5");
  assert.equal((await sync(base(h))).status, 200);
  assert.equal(getProof(h)?.payload.taskId, "solar-panel-install");
});

test("an oversized reportId is dropped, but the proof itself still syncs", async () => {
  // reportId is UNSIGNED and only groups notifications, so it can be ignored rather than
  // rejected — dropping it must not cost the reporter their capture.
  const h = hash("6");
  const res = await app.request("/sync", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...signPayload(base(h) as never, kp.privateKey), reportId: "r".repeat(500) }),
  });
  assert.equal(res.status, 200);
  const entry = getProof(h);
  assert.ok(entry, "the proof must still be stored");
  assert.equal(entry.reportId, undefined, "the oversized grouping key is dropped");
});

test("the geohash precision check still applies alongside the new caps", async () => {
  const h = hash("7");
  const res = await sync({ ...base(h), geohash: "9q8yyabcdef" });
  assert.equal(res.status, 400);
  assert.match(((await res.json()) as { error: string }).error, /too precise/);
});
