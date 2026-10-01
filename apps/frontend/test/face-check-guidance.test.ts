// face-check-guidance.test.ts: the face check breaks when a person looks away or moves, and every
// failure used to read "The check did not finish". The native module now reports a stable code, each
// code gets advice the person can act on, the screen shows how to get ready, and after five failed
// checks in three minutes the phone asks for a 30-minute pause (AWS's guidance for this service).

import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  COOLDOWN_MS,
  GET_READY_TIPS,
  MAX_FAILED_CHECKS,
  __setLivenessPassStore,
  incompleteReason,
  outcomeCopy,
  runFaceLiveness,
  type LivenessCapture,
} from "../src/face-liveness.js";
import type { FaceLivenessConfig } from "../src/flags.js";

const API = "https://api.example.test/";
const SESSION = "0f8fad5b-d9cb-469f-a165-70867728950e";
const CONFIG: FaceLivenessConfig = {
  region: "eu-west-1",
  identityPoolId: "eu-central-1:11111111-2222-4333-8444-555555555555",
  identityPoolRegion: "eu-central-1",
};

function memStore() {
  const m = new Map<string, string>();
  return {
    async getItemAsync(k: string) {
      return m.get(k) ?? null;
    },
    async setItemAsync(k: string, v: string) {
      m.set(k, v);
    },
    async deleteItemAsync(k: string) {
      m.delete(k);
    },
  };
}

beforeEach(() => __setLivenessPassStore(memStore()));
afterEach(() => __setLivenessPassStore(null));

let sessions = 0;
const fetchImpl = (async (input: string | URL | Request) => {
  if (String(input).endsWith("/liveness/session")) {
    sessions++;
    return new Response(JSON.stringify({ sessionId: SESSION }), { status: 200 });
  }
  return new Response(JSON.stringify({ verifiedPerson: false, ticket: "" }), { status: 200 });
}) as typeof fetch;

function failingCapture(code: string): LivenessCapture {
  return {
    available: () => true,
    configure: async () => true,
    start: async () => ({ status: "failed", code }),
  };
}

const runWith = (code: string, now: number) =>
  runFaceLiveness({ provider: "aws", config: CONFIG, capture: failingCapture(code), apiUrl: API, fetchImpl, now });

test("incompleteReason maps the native codes, and anything else (older builds) to other", () => {
  assert.equal(incompleteReason("user_cancelled"), "cancelled");
  for (const c of ["face_not_in_oval", "too_close", "no_face"]) assert.equal(incompleteReason(c), "face-position", c);
  assert.equal(incompleteReason("multiple_faces"), "multiple-faces");
  for (const c of ["interrupted", "timed_out"]) assert.equal(incompleteReason(c), "interrupted", c);
  for (const c of ["camera_denied", "camera_unavailable"]) assert.equal(incompleteReason(c), "camera", c);
  for (const c of ["service", "User cancelled the face liveness check.", ""]) assert.equal(incompleteReason(c), "other", c);
});

test("a failed capture carries its reason", async () => {
  assert.deepEqual(await runWith("face_not_in_oval", 1_000), { state: "incomplete", reason: "face-position" });
});

test("each reason has its own advice, and every one says reporting still works", () => {
  const position = outcomeCopy({ state: "incomplete", reason: "face-position" });
  assert.match(position.body, /oval/i);
  assert.match(position.body, /until (it|the check) finishes/i);
  assert.match(outcomeCopy({ state: "incomplete", reason: "multiple-faces" }).body, /only your face/i);
  assert.match(outcomeCopy({ state: "incomplete", reason: "interrupted" }).body, /call|notification|leav/i);
  assert.match(outcomeCopy({ state: "incomplete", reason: "camera" }).body, /Settings/);
  assert.match(outcomeCopy({ state: "not-confirmed" }).body, /eye level/i);
  for (const reason of ["face-position", "multiple-faces", "interrupted", "cancelled", "camera", "other"] as const) {
    const c = outcomeCopy({ state: "incomplete", reason });
    assert.match(c.body, /report/i, reason);
    assert.notEqual(c.tone, "success", reason);
  }
});

test("after five failed checks in three minutes the phone pauses for 30 minutes, without opening a session", async () => {
  const t0 = 10_000_000;
  for (let i = 0; i < MAX_FAILED_CHECKS; i++) await runWith("face_not_in_oval", t0 + i * 10_000);
  sessions = 0;
  const paused = await runWith("face_not_in_oval", t0 + 60_000);
  assert.equal(paused.state, "unavailable");
  assert.equal(paused.state === "unavailable" ? paused.reason : "", "cooling-down");
  assert.equal(sessions, 0, "no paid session while paused");
  const copy = outcomeCopy(paused);
  assert.equal(copy.retry, false);
  assert.match(copy.body, /report/i);
  // After the pause, a check runs again.
  assert.equal((await runWith("face_not_in_oval", t0 + 60_000 + COOLDOWN_MS)).state, "incomplete");
});

test("cancelling yourself or a missing camera never counts towards the pause", async () => {
  const t0 = 50_000_000;
  for (let i = 0; i < MAX_FAILED_CHECKS + 2; i++) {
    await runWith(i % 2 ? "user_cancelled" : "camera_denied", t0 + i * 1_000);
  }
  assert.equal((await runWith("face_not_in_oval", t0 + 20_000)).state, "incomplete");
});

test("failures spread over more than three minutes never pause", async () => {
  const t0 = 90_000_000;
  for (let i = 0; i < MAX_FAILED_CHECKS + 2; i++) await runWith("face_not_in_oval", t0 + i * 60_000);
  assert.equal((await runWith("face_not_in_oval", t0 + 8 * 60_000)).state, "incomplete");
});

test("the screen shows how to get ready before the check", () => {
  const screen = readFileSync(new URL("../app/face-check.tsx", import.meta.url), "utf8");
  assert.match(screen, /Before you start/);
  assert.match(screen, /GET_READY_TIPS\.map\(/);
  const tips = GET_READY_TIPS.join(" ");
  for (const tip of [/light/i, /eye level/i, /sunglasses|hat/i, /until it finishes/i]) assert.match(tips, tip);
});

test("the native module reports a stable code, compared against the SDK's own errors", () => {
  const swift = readFileSync(new URL("../modules/prufture-liveness/ios/PruftureLivenessModule.swift", import.meta.url), "utf8");
  assert.match(swift, /"code": codeFor\(error\)/);
  for (const [sdk, code] of [
    ["faceInOvalMatchExceededTimeLimitError", "face_not_in_oval"],
    ["userCancelled", "user_cancelled"],
    ["countdownMultipleFaces", "multiple_faces"],
    ["sessionInterrupted", "interrupted"],
  ]) {
    assert.match(swift, new RegExp(`error == \\.${sdk} \\{ return "${code}" \\}`), sdk);
  }
});
