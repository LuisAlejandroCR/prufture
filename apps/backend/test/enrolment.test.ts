// enrolment.test.ts: unit tests for the enrolment page helpers: commitment and programme id
// validation (same rules as apps/api/src/personhood.ts), the public group mapping that never carries
// the commitment list, and the coordinator status mapping that keeps 402 and 503 apart.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ACTION_STATES,
  SNARK_FIELD,
  actionNotice,
  commitmentError,
  coordinatorAppUserId,
  isActionState,
  isCommitment,
  isProgrammeId,
  newRoundConfirmed,
  postCoordinator,
  staffWriteAllowed,
  toActionState,
  toGroupResult,
} from "../lib/enrolment.js";

test("staffWriteAllowed fails closed: no Clerk, no user or no invite pass never writes", () => {
  const ok = { configured: true, userId: "user_1", inviteRequired: true, passValid: true };
  assert.equal(staffWriteAllowed(ok), true);
  assert.equal(staffWriteAllowed({ ...ok, inviteRequired: false, passValid: false }), true);
  assert.equal(staffWriteAllowed({ ...ok, configured: false }), false);
  assert.equal(staffWriteAllowed({ ...ok, userId: null }), false);
  assert.equal(staffWriteAllowed({ ...ok, userId: "" }), false);
  assert.equal(staffWriteAllowed({ ...ok, passValid: false }), false);
});

test("both enrolment server actions check staff before calling the coordinator api", () => {
  const src = readFileSync(
    new URL("../app/dashboard/programmes/[id]/enrolment/actions.ts", import.meta.url),
    "utf8",
  );
  for (const name of ["enrolAction", "newRoundAction"]) {
    const body = src.slice(src.indexOf(`export async function ${name}`));
    const gate = body.indexOf('if (!(await isStaff())) back(programmeId, "not_staff")');
    const call = body.indexOf("postCoordinator(");
    assert.ok(gate > 0 && gate < call, `${name} must gate before postCoordinator`);
  }
});

test("isCommitment accepts a decimal field element above zero", () => {
  assert.equal(isCommitment("1"), true);
  assert.equal(isCommitment("12345678901234567890"), true);
  assert.equal(isCommitment((SNARK_FIELD - 1n).toString()), true);
});

test("isCommitment rejects zero, the field size and above, non-decimal and non-string input", () => {
  for (const v of ["0", "000", SNARK_FIELD.toString(), (SNARK_FIELD + 1n).toString(), "9".repeat(79)]) {
    assert.equal(isCommitment(v), false, v);
  }
  for (const v of ["", " 1", "1 ", "-1", "1.5", "0x10", "1e5", "abc"]) {
    assert.equal(isCommitment(v), false, JSON.stringify(v));
  }
  for (const v of [1, 1n, null, undefined, {}, ["1"]]) {
    assert.equal(isCommitment(v), false, String(v));
  }
});

test("commitmentError explains each rejection and passes a valid value (trimmed)", () => {
  assert.equal(commitmentError(" 42 "), null);
  assert.match(commitmentError("") ?? "", /Enter the commitment/);
  assert.match(commitmentError("12a") ?? "", /digits only/);
  assert.match(commitmentError("9".repeat(79)) ?? "", /too long/);
  assert.match(commitmentError("0") ?? "", /outside the valid range/);
  assert.match(commitmentError(SNARK_FIELD.toString()) ?? "", /outside the valid range/);
});

test("isProgrammeId mirrors the api rule", () => {
  assert.equal(isProgrammeId("water-2026"), true);
  assert.equal(isProgrammeId("a"), true);
  for (const v of ["", "-lead", "Upper", "has space", "a".repeat(65), "a/b", 5]) {
    assert.equal(isProgrammeId(v), false, String(v));
  }
});

test("toGroupResult keeps size, epoch and root but never the commitment list", () => {
  const r = toGroupResult(200, { programmeId: "water", epoch: 3, commitments: ["11", "22"], root: "999" });
  assert.deepEqual(r, { state: "ok", group: { programmeId: "water", size: 2, epoch: 3, root: "999" } });
  assert.equal(JSON.stringify(r).includes("11"), false);
  assert.deepEqual(toGroupResult(200, { programmeId: "w", epoch: 1, commitments: [], root: null }), {
    state: "ok",
    group: { programmeId: "w", size: 0, epoch: 1, root: null },
  });
});

test("toGroupResult maps 404 to empty, 400 to invalid and anything else to unreachable", () => {
  assert.deepEqual(toGroupResult(404, null), { state: "empty" });
  assert.deepEqual(toGroupResult(400, null), { state: "invalid" });
  assert.deepEqual(toGroupResult(500, null), { state: "unreachable" });
  assert.deepEqual(toGroupResult(200, null), { state: "unreachable" });
  assert.deepEqual(toGroupResult(200, { programmeId: "w" }), { state: "unreachable" });
});

test("toActionState keeps not entitled (402) and entitlement check down (503) distinct", () => {
  assert.equal(toActionState("enrol", 402, {}), "not_entitled");
  assert.equal(toActionState("enrol", 503, { degraded: true }), "entitlement_down");
  assert.equal(toActionState("epoch", 402, {}), "not_entitled");
  assert.equal(toActionState("epoch", 503, {}), "entitlement_down");
});

test("toActionState: 403 means the account is not a programme admin, not an outage", () => {
  assert.equal(toActionState("enrol", 403, { error: "programme admin required" }), "not_admin");
  assert.equal(toActionState("epoch", 403, {}), "not_admin");
  assert.match(actionNotice("not_admin").text, /PERSONHOOD_ADMIN_APP_USER_IDS/);
  assert.match(actionNotice("not_admin").text, /Nothing was saved/);
});

test("toActionState maps success, duplicates and the remaining statuses", () => {
  assert.equal(toActionState("enrol", 200, { added: true, size: 1, epoch: 1 }), "enrolled");
  assert.equal(toActionState("enrol", 200, { added: false, size: 1, epoch: 1 }), "already_enrolled");
  assert.equal(toActionState("epoch", 200, { epoch: 2 }), "new_round");
  assert.equal(toActionState("enrol", 400, {}), "invalid");
  assert.equal(toActionState("enrol", 401, {}), "not_configured");
  assert.equal(toActionState("epoch", 404, {}), "unknown_programme");
  assert.equal(toActionState("enrol", 500, {}), "unreachable");
  assert.equal(toActionState("enrol", 502, null), "unreachable");
});

test("every action state has a notice, and degraded ones never claim a write", () => {
  for (const s of ACTION_STATES) {
    assert.equal(isActionState(s), true);
    const n = actionNotice(s);
    assert.ok(n.title.length > 0 && n.text.length > 0, s);
  }
  for (const s of ["not_configured", "not_entitled", "entitlement_down", "invalid"] as const) {
    assert.match(actionNotice(s).text, /Nothing was saved/, s);
  }
  assert.match(actionNotice("entitlement_down").text, /not a missing plan/);
  assert.match(actionNotice("unreachable").text, /cannot tell whether anything changed/);
  assert.equal(isActionState("granted"), false);
  assert.equal(isActionState(undefined), false);
});

test("coordinatorAppUserId reads the server env and treats blank as unset", () => {
  assert.equal(coordinatorAppUserId({ COORDINATOR_APP_USER_ID: " rc-anon-1 " }), "rc-anon-1");
  assert.equal(coordinatorAppUserId({ COORDINATOR_APP_USER_ID: "  " }), null);
  assert.equal(coordinatorAppUserId({}), null);
});

test("postCoordinator calls the exact endpoint with the app user id header", async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ added: true, size: 1, epoch: 1 }), { status: 200 });
  }) as typeof fetch;
  try {
    assert.equal(await postCoordinator("enrol", { programmeId: "water", commitment: "7" }, "rc-1"), "enrolled");
    assert.equal(await postCoordinator("epoch", { programmeId: "water" }, "rc-1"), "new_round");
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.equal(calls[0].url, "http://localhost:8787/coordinator/personhood/enrol");
  assert.equal(calls[1].url, "http://localhost:8787/coordinator/personhood/epoch");
  assert.equal((calls[0].init.headers as Record<string, string>)["x-app-user-id"], "rc-1");
  assert.deepEqual(JSON.parse(String(calls[0].init.body)), { programmeId: "water", commitment: "7" });
});

test("postCoordinator does not call the api for invalid input or a missing app user id", async () => {
  let called = 0;
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    called++;
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
  try {
    assert.equal(await postCoordinator("enrol", { programmeId: "water", commitment: "0" }, "rc-1"), "invalid");
    assert.equal(await postCoordinator("enrol", { programmeId: "Bad Id", commitment: "7" }, "rc-1"), "invalid");
    assert.equal(await postCoordinator("enrol", { programmeId: "water", commitment: "7" }, null), "not_configured");
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.equal(called, 0);
});

test("the page says enrolment is in person and the coordinator knows who they enrolled", () => {
  const src = readFileSync(new URL("../app/dashboard/programmes/[id]/enrolment/page.tsx", import.meta.url), "utf8");
  assert.match(src, /Enrolment happens in person/);
  assert.match(src, /You therefore know who you enrolled/);
  assert.equal(src.includes("commitments.map"), false);
});

test("postCoordinator reports unreachable when fetch throws", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error("ECONNREFUSED");
  }) as typeof fetch;
  try {
    assert.equal(await postCoordinator("epoch", { programmeId: "water" }, "rc-1"), "unreachable");
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("a new round needs the programme id typed out, checked again by the server action", () => {
  assert.equal(newRoundConfirmed("water-2026", "water-2026"), true);
  assert.equal(newRoundConfirmed("water-2026", "  water-2026 "), true);
  assert.equal(newRoundConfirmed("water-2026", "water"), false);
  assert.equal(newRoundConfirmed("water-2026", ""), false);
  assert.equal(newRoundConfirmed("water-2026", null), false);
  assert.match(actionNotice("confirm_needed").text, /Nothing changed/);
  const action = readFileSync(new URL("../app/dashboard/programmes/[id]/enrolment/actions.ts", import.meta.url), "utf8");
  assert.match(action, /if \(!newRoundConfirmed\(programmeId, form\.get\("confirm"\)\)\) back\(programmeId, "confirm_needed"\)/);
});
