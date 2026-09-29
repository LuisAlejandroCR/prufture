// staff-invite.test.ts: the invitation-code gate after staff sign-in — which codes count, matching,
// the signed pass cookie (bound to one user, tamper-proof, revoked with its code) and the rule that
// the gate is checked in middleware, not only in a layout.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  codeHash,
  inviteCodes,
  isActiveCodeHash,
  isInvitePath,
  isInviteRequired,
  matchInvite,
  signPass,
  verifyPass,
} from "../lib/staff-invite.js";

const src = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const ENV = { STAFF_INVITE_CODES: " lima-team-2026 , BOGOTA-OPS-77\nshort", CLERK_SECRET_KEY: "sk_test_unit" };

test("codes are trimmed, case-insensitive, and short ones are ignored", () => {
  assert.deepEqual(inviteCodes(ENV), ["LIMA-TEAM-2026", "BOGOTA-OPS-77"]);
  assert.equal(isInviteRequired(ENV), true);
  assert.equal(isInviteRequired({}), false);
  assert.equal(isInviteRequired({ STAFF_INVITE_CODES: "abc, , 1234567" }), false);
});

test("matchInvite accepts any active code in any case and rejects the rest", async () => {
  assert.equal(await matchInvite("  Lima-Team-2026 ", ENV), await codeHash("LIMA-TEAM-2026"));
  assert.equal(await matchInvite("bogota-ops-77", ENV), await codeHash("BOGOTA-OPS-77"));
  assert.equal(await matchInvite("short", ENV), null);
  assert.equal(await matchInvite("wrong-code-123", ENV), null);
  assert.equal(await matchInvite("", ENV), null);
});

test("the stored hash never contains the code", async () => {
  const h = await codeHash("LIMA-TEAM-2026");
  assert.match(h, /^[0-9a-f]{64}$/);
  assert.ok(!h.toUpperCase().includes("LIMA"));
});

test("removing a code from the env revokes its hash", async () => {
  const h = await codeHash("LIMA-TEAM-2026");
  assert.equal(await isActiveCodeHash(h, ENV), true);
  assert.equal(await isActiveCodeHash(h, { ...ENV, STAFF_INVITE_CODES: "BOGOTA-OPS-77" }), false);
  assert.equal(await isActiveCodeHash(undefined, ENV), false);
  assert.equal(await isActiveCodeHash(42, ENV), false);
});

test("the pass cookie is bound to one user, tamper-proof and revocable", async () => {
  const h = await codeHash("LIMA-TEAM-2026");
  const pass = await signPass("user_a", h, ENV);
  assert.equal(await verifyPass(pass, "user_a", ENV), true);
  assert.equal(await verifyPass(pass, "user_b", ENV), false, "another user");
  assert.equal(await verifyPass(pass, "user_a", { ...ENV, CLERK_SECRET_KEY: "sk_test_other" }), false, "other secret");
  assert.equal(await verifyPass(pass, "user_a", { ...ENV, STAFF_INVITE_CODES: "BOGOTA-OPS-77" }), false, "revoked");
  const other = await codeHash("BOGOTA-OPS-77");
  assert.equal(await verifyPass(`${other}.${pass.split(".")[1]}`, "user_a", ENV), false, "swapped hash");
  assert.equal(await verifyPass(`${pass}0`, "user_a", ENV), false, "edited signature");
  assert.equal(await verifyPass(undefined, "user_a", ENV), false);
  assert.equal(await verifyPass("garbage", "user_a", ENV), false);
  assert.equal(await verifyPass(pass, "user_a", { STAFF_INVITE_CODES: ENV.STAFF_INVITE_CODES }), false, "no secret");
});

test("/invite paths", () => {
  for (const p of ["/invite", "/invite/x"]) assert.equal(isInvitePath(p), true, p);
  for (const p of ["/", "/invites", "/dashboard"]) assert.equal(isInvitePath(p), false, p);
});

test("the gate runs in middleware and only the server reads the stored invite", () => {
  const mw = src("../middleware.ts");
  assert.match(mw, /isInviteRequired\(\)/);
  assert.match(mw, /verifyPass\(/);
  assert.match(mw, /privateMetadata/);
  // The code hash lives in privateMetadata (backend only), never publicMetadata.
  assert.doesNotMatch(src("../app/invite/actions.ts"), /publicMetadata|unsafeMetadata/);
  assert.match(src("../app/invite/actions.ts"), /^"use server";/m);
});
