// liveness-aws.test.ts: the "aws" liveness adapter with a stubbed Rekognition client — success,
// low confidence, failed session, SDK throw, missing config — and the invariant that no image
// bytes, confidence or raw vendor text ever appear in a /liveness/* response.

import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { app } from "../src/index.js";
import {
  createLivenessSession,
  livenessSessionVerdict,
  overrideLivenessSessionPortForTests,
  selectedLivenessPort,
  selectedLivenessSessionPort,
} from "../src/assurance.js";
import {
  awsConfigured,
  confidenceBand,
  createAwsLiveness,
  minConfidence,
  type FaceLivenessClient,
} from "../src/liveness-aws.js";
import { readTicket } from "../src/liveness-ticket.js";
import {
  SESSION_TTL_MS,
  claimLivenessSession,
  rememberLivenessSession,
  resetLivenessSessionsForTests,
} from "../src/liveness-sessions.js";
import { resetLivenessRateLimitForTests } from "../src/liveness-rate-limit.js";

const SESSION = "0f8fad5b-d9cb-469f-a165-70867728950e";
const CONFIGURED = { AWS_REGION: "eu-west-1", AWS_ACCESS_KEY_ID: "AKIATEST", AWS_SECRET_ACCESS_KEY: "test-secret" };

// Recognisable markers: if any of these reaches a response body, the invariant is broken.
const IMAGE_MARKER = "SECRETIMAGEBYTES";
const IMAGE_BYTES = new Uint8Array(Buffer.from(IMAGE_MARKER));
const CONFIDENCE = 97.123456;
const LOW_CONFIDENCE = 42.987654;

/** A stub that returns what the real SDK would, images and all. */
function stub(result: { Status?: string; Confidence?: number } | (() => never), session: string | (() => never) = SESSION) {
  const calls: string[] = [];
  const client: FaceLivenessClient = {
    async createSession() {
      calls.push("create");
      if (typeof session === "function") session();
      return { SessionId: session as string, $metadata: { requestId: "req-marker" } } as { SessionId: string };
    },
    async getResults(id) {
      calls.push(`get:${id}`);
      if (typeof result === "function") result();
      return {
        ...(result as object),
        SessionId: id,
        ReferenceImage: { Bytes: IMAGE_BYTES, BoundingBox: { Width: 0.5 } },
        AuditImages: [{ Bytes: IMAGE_BYTES }],
      } as { Status?: string; Confidence?: number };
    },
  };
  return { client, calls };
}

const port = (client: FaceLivenessClient, env: NodeJS.ProcessEnv = CONFIGURED) => createAwsLiveness({ client, env });

afterEach(() => {
  overrideLivenessSessionPortForTests(undefined);
  resetLivenessRateLimitForTests();
  delete process.env.LIVENESS_PROVIDER;
});

test("success: SUCCEEDED at or above the threshold is verifiedPerson true, and only that", async () => {
  const { client, calls } = stub({ Status: "SUCCEEDED", Confidence: CONFIDENCE });
  const r = await livenessSessionVerdict(SESSION, port(client));
  assert.equal(r.available, true);
  assert.deepEqual(r.data, { verifiedPerson: true });
  assert.deepEqual(calls, [`get:${SESSION}`]);

  const exact = await livenessSessionVerdict(SESSION, port(stub({ Status: "SUCCEEDED", Confidence: 90 }).client));
  assert.deepEqual(exact.data, { verifiedPerson: true });
});

test("low confidence: SUCCEEDED below LIVENESS_MIN_CONFIDENCE is verifiedPerson false", async () => {
  const r = await livenessSessionVerdict(SESSION, port(stub({ Status: "SUCCEEDED", Confidence: LOW_CONFIDENCE }).client));
  assert.equal(r.available, true);
  assert.deepEqual(r.data, { verifiedPerson: false });

  // A raised threshold refuses a score the default would accept.
  const strict = port(stub({ Status: "SUCCEEDED", Confidence: 95 }).client, { ...CONFIGURED, LIVENESS_MIN_CONFIDENCE: "99" });
  assert.deepEqual((await livenessSessionVerdict(SESSION, strict)).data, { verifiedPerson: false });
  // A missing confidence never passes.
  assert.deepEqual((await livenessSessionVerdict(SESSION, port(stub({ Status: "SUCCEEDED" }).client))).data, { verifiedPerson: false });
});

test("LIVENESS_MIN_CONFIDENCE defaults to 90 and ignores junk or out-of-range values", () => {
  assert.equal(minConfidence({}), 90);
  assert.equal(minConfidence({ LIVENESS_MIN_CONFIDENCE: "75" }), 75);
  for (const bad of ["abc", "-1", "101", "NaN", "Infinity", " "]) {
    assert.equal(minConfidence({ LIVENESS_MIN_CONFIDENCE: bad }), 90, bad);
  }
});

test("failed session: FAILED, EXPIRED or unfinished is verifiedPerson false, even with a high score", async () => {
  for (const Status of ["FAILED", "EXPIRED", "CREATED", "IN_PROGRESS", undefined]) {
    const r = await livenessSessionVerdict(SESSION, port(stub({ Status, Confidence: 99.9 }).client));
    assert.equal(r.available, true, String(Status));
    assert.deepEqual(r.data, { verifiedPerson: false }, String(Status));
  }
});

test("SDK throw: both calls degrade to a typed unavailable, never a throw", async () => {
  const boom = () => {
    throw new Error(`AccessDeniedException confidence=${CONFIDENCE} ${IMAGE_MARKER}`);
  };
  const r = await livenessSessionVerdict(SESSION, port(stub(boom).client));
  assert.equal(r.available, false);
  assert.equal(r.data, null);

  const s = await createLivenessSession(port(stub({}, boom).client));
  assert.equal(s.available, false);

  // A session id that is not a UUID is not passed on.
  const junk = await createLivenessSession(port(stub({}, "not-a-session").client));
  assert.equal(junk.available, false);
});

test("missing config: no region or no credentials is a typed unavailable and AWS is never called", async () => {
  const cases: NodeJS.ProcessEnv[] = [
    {},
    { AWS_REGION: "eu-west-1" },
    { AWS_ACCESS_KEY_ID: "AKIATEST", AWS_SECRET_ACCESS_KEY: "x" },
    { AWS_REGION: "eu-west-1", AWS_ACCESS_KEY_ID: "AKIATEST" },
  ];
  for (const env of cases) {
    const { client, calls } = stub({ Status: "SUCCEEDED", Confidence: CONFIDENCE });
    const p = port(client, env);
    const s = await createLivenessSession(p);
    const v = await livenessSessionVerdict(SESSION, p);
    assert.equal(s.available, false, JSON.stringify(env));
    assert.equal(v.available, false, JSON.stringify(env));
    assert.deepEqual(calls, [], JSON.stringify(env));
  }
  assert.equal(awsConfigured({ AWS_REGION: "eu-west-1", AWS_PROFILE: "prufture" }), true);
  assert.equal(awsConfigured(CONFIGURED), true);
});

test("selection: LIVENESS_PROVIDER=aws picks the aws adapter; unset and unknown stay off", () => {
  assert.equal(selectedLivenessSessionPort(), null);
  assert.equal(selectedLivenessPort().name, "none");
  process.env.LIVENESS_PROVIDER = "aws";
  assert.equal(selectedLivenessSessionPort()?.name, "aws");
  assert.equal(selectedLivenessPort().name, "aws");
  process.env.LIVENESS_PROVIDER = "rekognition";
  assert.equal(selectedLivenessSessionPort(), null);
  assert.equal(selectedLivenessPort().name, "none");
});

test("aws in frames mode (/verify-identity) degrades: the aws flow never takes frames", async () => {
  const r = await port(stub({ Status: "SUCCEEDED", Confidence: CONFIDENCE }).client).check({
    frames: ["ZmFrZQ=="],
    nonceHex: "00112233445566778899aabbccddeeff",
    challenges: ["center"],
  });
  assert.equal(r.available, false);
});

const post = (path: string, body?: unknown) =>
  app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

test("routes: POST /liveness/session returns { sessionId } only; /liveness/result returns { verifiedPerson, ticket }", async () => {
  overrideLivenessSessionPortForTests(port(stub({ Status: "SUCCEEDED", Confidence: CONFIDENCE }).client));
  const s = await post("/liveness/session");
  assert.equal(s.status, 200);
  assert.deepEqual(await s.json(), { sessionId: SESSION });

  const r = await post("/liveness/result", { sessionId: SESSION });
  assert.equal(r.status, 200);
  const j = (await r.json()) as { verifiedPerson: boolean; ticket: string };
  assert.deepEqual(Object.keys(j).sort(), ["ticket", "verifiedPerson"]);
  assert.equal(j.verifiedPerson, true);
  assert.deepEqual(readTicket(j.ticket), { verifiedPerson: true, degraded: false });
});

test("routes: bad input is 400 and off/unconfigured degrades (503 session, degraded ticket result)", async () => {
  overrideLivenessSessionPortForTests(port(stub({ Status: "SUCCEEDED", Confidence: CONFIDENCE }).client));
  for (const body of [{}, { sessionId: "../../etc" }, { sessionId: 12 }]) {
    assert.equal((await post("/liveness/result", body)).status, 400, JSON.stringify(body));
  }

  // Default: LIVENESS_PROVIDER unset, no session port at all.
  overrideLivenessSessionPortForTests(undefined);
  assert.equal((await post("/liveness/session")).status, 503);
  const off = await post("/liveness/result", { sessionId: SESSION });
  assert.equal(off.status, 200);
  const oj = (await off.json()) as { verifiedPerson: boolean; degraded: boolean; ticket: string };
  assert.equal(oj.verifiedPerson, false);
  assert.equal(oj.degraded, true);
  assert.deepEqual(readTicket(oj.ticket), { verifiedPerson: false, degraded: true });

  // aws selected but no AWS config in this process.
  overrideLivenessSessionPortForTests(port(stub({}).client, {}));
  assert.equal((await post("/liveness/session")).status, 503);
});

test("invariant: no image bytes, confidence, request id or vendor error text in any /liveness/* response", async () => {
  const boom = () => {
    throw new Error(`ThrottlingException confidence=${CONFIDENCE} ${IMAGE_MARKER}`);
  };
  const scenarios: FaceLivenessClient[] = [
    stub({ Status: "SUCCEEDED", Confidence: CONFIDENCE }).client,
    stub({ Status: "SUCCEEDED", Confidence: LOW_CONFIDENCE }).client,
    stub({ Status: "FAILED", Confidence: CONFIDENCE }).client,
    stub(boom, boom).client,
  ];
  const bodies: string[] = [];
  for (const client of scenarios) {
    overrideLivenessSessionPortForTests(port(client));
    bodies.push(await (await post("/liveness/session")).text());
    const res = await post("/liveness/result", { sessionId: SESSION });
    const j = (await res.json()) as { ticket?: string } & Record<string, unknown>;
    // The ticket is an opaque MAC'd blob: check what it carries structurally, not by substring.
    const { ticket, ...rest } = j;
    assert.equal(typeof ticket, "string");
    const claims = JSON.parse(Buffer.from(ticket!.split(".")[1]!, "base64url").toString("utf8"));
    assert.deepEqual(Object.keys(claims).sort(), ["d", "p", "t"]);
    for (const v of Object.values(rest)) assert.equal(typeof v, "boolean");
    bodies.push(JSON.stringify(rest));
  }

  const all = bodies.join("\n");
  const b64 = Buffer.from(IMAGE_MARKER).toString("base64");
  for (const needle of [IMAGE_MARKER, b64, String(CONFIDENCE), String(LOW_CONFIDENCE), "97.12", "42.98", "req-marker", "Exception"]) {
    assert.equal(all.includes(needle), false, `response leaked ${needle}`);
  }
  for (const key of ["confidence", "Confidence", "ReferenceImage", "AuditImages", "Bytes", "Status", "error\":\"Throttling"]) {
    assert.equal(all.includes(key), false, `response leaked key ${key}`);
  }
});

test("single use: a passed session mints one verified ticket; a replay or a never-opened id is a failed check", async () => {
  resetLivenessSessionsForTests();
  const { client, calls } = stub({ Status: "SUCCEEDED", Confidence: CONFIDENCE });
  overrideLivenessSessionPortForTests(port(client));

  // Never opened by this server: refused without asking AWS.
  const stranger = await post("/liveness/result", { sessionId: SESSION });
  const sj = (await stranger.json()) as { verifiedPerson: boolean; degraded: boolean; ticket: string };
  assert.deepEqual(readTicket(sj.ticket), { verifiedPerson: false, degraded: false });
  assert.equal(calls.filter((c) => c.startsWith("get:")).length, 0);

  assert.equal((await post("/liveness/session")).status, 200);
  const first = (await (await post("/liveness/result", { sessionId: SESSION })).json()) as { ticket: string };
  assert.deepEqual(readTicket(first.ticket), { verifiedPerson: true, degraded: false });

  const replay = (await (await post("/liveness/result", { sessionId: SESSION })).json()) as {
    verifiedPerson: boolean;
    ticket: string;
  };
  assert.equal(replay.verifiedPerson, false);
  assert.deepEqual(readTicket(replay.ticket), { verifiedPerson: false, degraded: false });
  assert.equal(calls.filter((c) => c.startsWith("get:")).length, 1, "a replay never reaches AWS");
});

test("single use: a provider outage gives the session back so the device can retry it", async () => {
  resetLivenessSessionsForTests();
  let down = true;
  const client: FaceLivenessClient = {
    async createSession() {
      return { SessionId: SESSION } as { SessionId: string };
    },
    async getResults() {
      if (down) throw new Error("ThrottlingException");
      return { Status: "SUCCEEDED", Confidence: CONFIDENCE } as { Status?: string; Confidence?: number };
    },
  };
  overrideLivenessSessionPortForTests(port(client));
  await post("/liveness/session");
  const outage = (await (await post("/liveness/result", { sessionId: SESSION })).json()) as { degraded: boolean };
  assert.equal(outage.degraded, true);

  down = false;
  const retry = (await (await post("/liveness/result", { sessionId: SESSION })).json()) as { ticket: string };
  assert.deepEqual(readTicket(retry.ticket), { verifiedPerson: true, degraded: false });
});

test("claimLivenessSession: once per id, never after the TTL", () => {
  resetLivenessSessionsForTests();
  rememberLivenessSession("a", 0);
  assert.equal(claimLivenessSession("a", 1), true);
  assert.equal(claimLivenessSession("a", 2), false);
  rememberLivenessSession("b", 0);
  assert.equal(claimLivenessSession("b", SESSION_TTL_MS + 1), false);
  assert.equal(claimLivenessSession("never", 0), false);
});

test("confidenceBand: ten-point bands, and none for a missing or broken score", () => {
  assert.equal(confidenceBand(97.12), "90-100");
  assert.equal(confidenceBand(100), "90-100");
  assert.equal(confidenceBand(89.99), "80-90");
  assert.equal(confidenceBand(0), "0-10");
  assert.equal(confidenceBand(undefined), "none");
  assert.equal(confidenceBand(Number.NaN), "none");
  assert.equal(confidenceBand(140), "none");
});

test("each verdict logs one line with a confidence band, never the score or the session", async () => {
  const lines: string[] = [];
  const real = console.log;
  console.log = (...args: unknown[]) => void lines.push(args.map(String).join(" "));
  try {
    const { client } = stub({ Status: "SUCCEEDED", Confidence: 87.654321 });
    await port(client).sessionResult(SESSION);
  } finally {
    console.log = real;
  }
  const line = lines.find((l) => l.startsWith("liveness "));
  assert.ok(line, "a liveness line is logged");
  assert.deepEqual(JSON.parse(line!.slice("liveness ".length)), { status: "SUCCEEDED", band: "80-90", min: 90, passed: false });
  assert.ok(!line!.includes(SESSION) && !line!.includes("87.65"), line);
});
