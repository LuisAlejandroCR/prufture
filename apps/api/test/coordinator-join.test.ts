// coordinator-join.test.ts: a coordinator joins the programme's staff in the app with an invitation
// code (COORDINATOR_INVITE_CODES), instead of an operator editing PROGRAMME_STAFF_APP_USER_IDS. The
// join survives a restart, ends when its code is retired, and wrong codes are rate limited.

import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { app } from "../src/index.js";
import * as store from "../src/store.js";
import { APP_USER_HEADER } from "../src/coordinator.js";
import { SAMPLE_HEADER } from "../src/coordinator-sample.js";
import { MAX_JOIN_FAILURES, __resetJoinAttempts } from "../src/coordinator-join.js";

const realFetch = globalThis.fetch;
const CODE = "PILOT-BOGOTA-2026";

afterEach(() => {
  globalThis.fetch = realFetch;
  __resetJoinAttempts();
  for (const k of [
    "REVENUECAT_SECRET_KEY",
    "REVENUECAT_PROJECT_ID",
    "REVENUECAT_COORDINATOR_ENTITLEMENT_ID",
    "COORDINATOR_INVITE_CODES",
    "PROGRAMME_STAFF_APP_USER_IDS",
  ]) {
    delete process.env[k];
  }
});

function setup(codes = CODE): string {
  const p = join(tmpdir(), `prufture-join-${randomUUID()}.json`);
  store.__setStorePathForTests(p);
  process.env.REVENUECAT_SECRET_KEY = "sk_test_join";
  process.env.REVENUECAT_PROJECT_ID = "proj1ab2c3d4";
  process.env.REVENUECAT_COORDINATOR_ENTITLEMENT_ID = "entl0c00rd1n4";
  process.env.COORDINATOR_INVITE_CODES = codes;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ items: [{ entitlement_id: "entl0c00rd1n4" }] }), { status: 200 })) as typeof fetch;
  return p;
}

const as = (id: string) => ({ [APP_USER_HEADER]: id });
const joinWith = (id: string, code: unknown) =>
  app.request("/coordinator/join", {
    method: "POST",
    headers: { "content-type": "application/json", ...as(id) },
    body: JSON.stringify({ code }),
  });
const isSample = async (id: string) =>
  (await app.request("/coordinator/reports", { headers: as(id) })).headers.get(SAMPLE_HEADER) === "1";

test("a valid code makes the caller programme staff, case and spaces aside", async () => {
  setup();
  assert.equal(await isSample("coord-1"), true);
  const res = await joinWith("coord-1", "  pilot-bogota-2026 ");
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { staff: true });
  assert.equal(await isSample("coord-1"), false);
  assert.equal(await isSample("coord-2"), true, "only the caller joined");
});

test("a wrong code is refused and changes nothing", async () => {
  setup();
  const res = await joinWith("coord-3", "NOT-THE-CODE");
  assert.equal(res.status, 403);
  assert.equal(await isSample("coord-3"), true);
});

test("with no codes configured, nobody can join", async () => {
  setup("");
  assert.equal((await joinWith("coord-4", CODE)).status, 403);
});

test("a join survives a restart and ends when its code is retired", async () => {
  const path = setup();
  await joinWith("coord-5", CODE);
  store.__flushForTests();
  store.__setStorePathForTests(path);
  assert.equal(await isSample("coord-5"), false, "still staff after reload");
  process.env.COORDINATOR_INVITE_CODES = "ANOTHER-CODE-2027";
  assert.equal(await isSample("coord-5"), true, "retiring the code removes the access");
});

test("repeated wrong codes are rate limited per caller", async () => {
  setup();
  for (let i = 0; i < MAX_JOIN_FAILURES; i++) assert.equal((await joinWith("coord-6", `WRONG-CODE-${i}`)).status, 403);
  assert.equal((await joinWith("coord-6", CODE)).status, 429, "even the right code waits once locked");
  assert.equal((await joinWith("coord-7", CODE)).status, 200, "another caller is unaffected");
});

test("joining needs the coordinator plan and a well-formed body", async () => {
  setup();
  const anon = await app.request("/coordinator/join", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code: CODE }),
  });
  assert.equal(anon.status, 401);
  for (const code of [undefined, 42, "", "x".repeat(200)]) assert.equal((await joinWith("coord-8", code)).status, 400);
});
