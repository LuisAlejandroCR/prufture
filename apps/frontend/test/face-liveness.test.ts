// face-liveness.test.ts: the one-time AWS face check flow with a stubbed api and native capture —
// exact endpoints, every degrade path (off, no module, 503, 429, offline, timeout, cancelled capture),
// the device pass store, and that a stored pass is attached to a saved report only when the flag is on.

import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  REQUEST_TIMEOUT_MS,
  TICKET_MARGIN_MS,
  TICKET_TTL_MS,
  __setLivenessPassStore,
  clearLivenessPass,
  loadLivenessPass,
  outcomeCopy,
  passUsableUntil,
  runFaceLiveness,
  saveLivenessPass,
  ticketClaims,
  type LivenessCapture,
} from "../src/face-liveness.js";
import { faceLivenessConfig, livenessProvider, type FaceLivenessConfig } from "../src/flags.js";
import { __pendingLiveness, __resetPendingLiveness } from "../src/liveness.js";
import { __setCaptureProofForTest, addPhoto, clearDraft, saveDraft, setLiveness, startDraft } from "../src/report-draft.js";
import { __setDraftStoreBackend, type DraftStoreBackend } from "../src/draft-store.js";
import { __setNotesBackend } from "../src/report-note.js";

const API = "https://api.example.test/";
const SESSION = "0f8fad5b-d9cb-469f-a165-70867728950e";
const POOL = "eu-central-1:11111111-2222-4333-8444-555555555555";
const CONFIG: FaceLivenessConfig = { region: "eu-west-1", identityPoolId: POOL, identityPoolRegion: "eu-central-1" };

/** A ticket shaped like the api's (v1.<base64url JSON>.<mac>); the device never checks the MAC. */
function ticket(p: boolean, d: boolean, t = Date.now()): string {
  return `v1.${Buffer.from(JSON.stringify({ p, d, t })).toString("base64url")}.${"m".repeat(43)}`;
}
const PASS = ticket(true, false);

interface Call {
  url: string;
  body: string;
}

function api(routes: Record<string, () => Response | Promise<Response>>) {
  const calls: Call[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, body: String(init?.body ?? "") });
    const path = url.slice(API.length - 1);
    const route = routes[path];
    if (!route) return new Response("{}", { status: 404 });
    return route();
  }) as typeof fetch;
  return { calls, fetchImpl };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

function capture(run: () => Promise<{ status: "completed" } | { status: "failed"; code: string }> = async () => ({ status: "completed" })) {
  const log: string[] = [];
  const c: LivenessCapture = {
    available: () => true,
    async configure(pool, region) {
      log.push(`configure:${pool}:${region}`);
      return true;
    },
    async start(id, region) {
      log.push(`start:${id}:${region}`);
      return run();
    },
  };
  return { c, log };
}

const happyApi = () =>
  api({
    "/liveness/session": () => json({ sessionId: SESSION }),
    "/liveness/result": () => json({ verifiedPerson: true, ticket: PASS }),
  });

const run = (over: Partial<Parameters<typeof runFaceLiveness>[0]> & { fetchImpl: typeof fetch }) =>
  runFaceLiveness({ provider: "aws", config: CONFIG, capture: capture().c, apiUrl: API, ...over });

test("passed: session -> capture -> result, exact endpoints, and only the ticket comes back", async () => {
  const { calls, fetchImpl } = happyApi();
  const { c, log } = capture();
  const out = await runFaceLiveness({ provider: "aws", config: CONFIG, capture: c, apiUrl: API, fetchImpl });
  assert.deepEqual(out, { state: "passed", ticket: PASS });
  assert.deepEqual(
    calls.map((x) => x.url),
    ["https://api.example.test/liveness/session", "https://api.example.test/liveness/result"],
  );
  assert.deepEqual(JSON.parse(calls[1]!.body), { sessionId: SESSION });
  // Guest credentials come from the pool's own region; the capture streams to the api's region.
  assert.deepEqual(log, [`configure:${POOL}:eu-central-1`, `start:${SESSION}:eu-west-1`]);
});

test("off, unconfigured or no native module: unavailable, and no paid session is ever opened", async () => {
  const cases: Array<[Partial<Parameters<typeof runFaceLiveness>[0]>, string]> = [
    [{ provider: "off" }, "off"],
    [{ config: null }, "not-configured"],
    [{ capture: null }, "no-module"],
    [{ capture: { ...capture().c, available: () => false } }, "no-module"],
    [{ capture: { ...capture().c, configure: async () => false } }, "not-configured"],
    [{ capture: { ...capture().c, configure: async () => { throw new Error("Amplify"); } } }, "not-configured"],
  ];
  for (const [over, reason] of cases) {
    const { calls, fetchImpl } = happyApi();
    assert.deepEqual(await run({ ...over, fetchImpl }), { state: "unavailable", reason }, reason);
    assert.equal(calls.length, 0, `${reason}: no request`);
  }
});

test("api degrades: 503 -> api, 429 -> rate-limited, offline -> network; the capture never starts", async () => {
  for (const [status, reason] of [[503, "api"], [429, "rate-limited"], [500, "api"]] as const) {
    const { fetchImpl } = api({ "/liveness/session": () => json({ error: "x", degraded: true }, status) });
    const { c, log } = capture();
    assert.deepEqual(await run({ capture: c, fetchImpl }), { state: "unavailable", reason });
    assert.equal(log.some((l) => l.startsWith("start")), false);
  }
  const offline = (async () => {
    throw new TypeError("Network request failed");
  }) as unknown as typeof fetch;
  assert.deepEqual(await run({ fetchImpl: offline }), { state: "unavailable", reason: "network" });

  // A malformed session id is refused before the camera opens.
  const { fetchImpl } = api({ "/liveness/session": () => json({ sessionId: "../../x" }) });
  const { c, log } = capture();
  assert.deepEqual(await run({ capture: c, fetchImpl }), { state: "unavailable", reason: "api" });
  assert.equal(log.some((l) => l.startsWith("start")), false);
});

test("a hung api times out as network, it never hangs the screen", async () => {
  const hung = ((_: unknown, init?: RequestInit) =>
    new Promise((_r, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted"))))) as typeof fetch;
  const t0 = Date.now();
  assert.deepEqual(await run({ fetchImpl: hung, timeoutMs: 20 }), { state: "unavailable", reason: "network" });
  assert.ok(Date.now() - t0 < REQUEST_TIMEOUT_MS);
});

test("cancelled or failed capture is incomplete and the api is never asked for a verdict", async () => {
  for (const runImpl of [
    async () => ({ status: "failed" as const, code: "userCancelled" }),
    async () => {
      throw new Error("NoViewControllerException");
    },
  ]) {
    const { calls, fetchImpl } = happyApi();
    assert.deepEqual(await run({ capture: capture(runImpl).c, fetchImpl }), { state: "incomplete" });
    assert.deepEqual(calls.map((x) => x.url), ["https://api.example.test/liveness/session"]);
  }
});

test("verdicts: not confirmed keeps nothing; degraded, missing or non-passing ticket is unavailable", async () => {
  const cases: Array<[unknown, unknown]> = [
    [{ verifiedPerson: false, ticket: ticket(false, false) }, { state: "not-confirmed" }],
    [{ verifiedPerson: false, degraded: true, ticket: ticket(false, true) }, { state: "unavailable", reason: "api" }],
    [{ verifiedPerson: true }, { state: "unavailable", reason: "api" }],
    [{ verifiedPerson: true, ticket: ticket(false, false) }, { state: "unavailable", reason: "api" }],
    [{ verifiedPerson: true, ticket: "x".repeat(300) }, { state: "unavailable", reason: "api" }],
  ];
  for (const [body, expected] of cases) {
    const { fetchImpl } = api({
      "/liveness/session": () => json({ sessionId: SESSION }),
      "/liveness/result": () => json(body),
    });
    assert.deepEqual(await run({ fetchImpl }), expected, JSON.stringify(body));
  }
  const { fetchImpl } = api({ "/liveness/session": () => json({ sessionId: SESSION }), "/liveness/result": () => json({}, 429) });
  assert.deepEqual(await run({ fetchImpl }), { state: "unavailable", reason: "rate-limited" });
});

test("flags: EXPO_PUBLIC_LIVENESS_PROVIDER is off unless exactly 'aws'; config needs a valid region and pool", () => {
  const keys = ["EXPO_PUBLIC_LIVENESS_PROVIDER", "EXPO_PUBLIC_AWS_REGION", "EXPO_PUBLIC_LIVENESS_IDENTITY_POOL_ID"] as const;
  const prev = keys.map((k) => process.env[k]);
  try {
    for (const k of keys) delete process.env[k];
    assert.equal(livenessProvider(), "off");
    assert.equal(faceLivenessConfig(), null);
    for (const v of ["AWS", "on", "true", " aws"]) {
      process.env.EXPO_PUBLIC_LIVENESS_PROVIDER = v;
      assert.equal(livenessProvider(), "off", v);
    }
    process.env.EXPO_PUBLIC_LIVENESS_PROVIDER = "aws";
    assert.equal(livenessProvider(), "aws");

    process.env.EXPO_PUBLIC_AWS_REGION = "eu-west-1";
    assert.equal(faceLivenessConfig(), null, "no pool");
    process.env.EXPO_PUBLIC_LIVENESS_IDENTITY_POOL_ID = "not-a-pool";
    assert.equal(faceLivenessConfig(), null, "junk pool");
    process.env.EXPO_PUBLIC_LIVENESS_IDENTITY_POOL_ID = POOL;
    assert.deepEqual(faceLivenessConfig(), CONFIG);
    process.env.EXPO_PUBLIC_AWS_REGION = "Europe";
    assert.equal(faceLivenessConfig(), null, "junk region");
  } finally {
    keys.forEach((k, i) => (prev[i] === undefined ? delete process.env[k] : (process.env[k] = prev[i])));
  }
});

test("ticketClaims reads the api ticket shape; passUsableUntil only for a non-degraded pass", () => {
  const t = 1_800_000_000_000;
  assert.deepEqual(ticketClaims(ticket(true, false, t)), { verifiedPerson: true, degraded: false, issuedAt: t });
  assert.equal(passUsableUntil(ticket(true, false, t)), t + TICKET_TTL_MS - TICKET_MARGIN_MS);
  assert.equal(passUsableUntil(ticket(false, false, t)), null);
  assert.equal(passUsableUntil(ticket(true, true, t)), null);
  for (const bad of [null, 1, "", "v1", "v2.e30.x", "v1.!!!.x", `v1.${Buffer.from("{\"p\":1}").toString("base64url")}.x`, "x".repeat(300)]) {
    assert.equal(ticketClaims(bad), null, String(bad));
  }
});

// ---- The device pass -----------------------------------------------------------------------------

function memStore() {
  const m = new Map<string, string>();
  return {
    m,
    store: {
      async getItemAsync(k: string) {
        return m.get(k) ?? null;
      },
      async setItemAsync(k: string, v: string) {
        m.set(k, v);
      },
      async deleteItemAsync(k: string) {
        m.delete(k);
      },
    },
  };
}

function memDraftStore(): DraftStoreBackend {
  const files = new Map<string, string>();
  return {
    async ensureDir() {},
    async readDraft() {
      return files.get("draft") ?? null;
    },
    async writeDraft(t) {
      files.set("draft", t);
    },
    async removeDir() {
      files.clear();
    },
    async copyIn(src) {
      return src;
    },
    async readBytes() {
      return new Uint8Array([1]);
    },
  };
}

const realFetch = globalThis.fetch;
let mem = memStore();
beforeEach(() => {
  mem = memStore();
  __setLivenessPassStore(mem.store);
  __setNotesBackend({ read: async () => null, write: async () => {} });
  __setDraftStoreBackend(memDraftStore());
  __resetPendingLiveness();
  clearDraft();
});
afterEach(() => {
  globalThis.fetch = realFetch;
  __setLivenessPassStore(null);
  __setCaptureProofForTest(null);
  delete process.env.EXPO_PUBLIC_LIVENESS_PROVIDER;
  delete process.env.EXPO_PUBLIC_API_URL;
});

test("pass store: only a passing ticket is kept; an expired one is removed on read", async () => {
  assert.equal(await saveLivenessPass(ticket(false, false)), false);
  assert.equal(await saveLivenessPass("junk"), false);
  assert.equal(mem.m.size, 0);

  const now = Date.now();
  assert.equal(await saveLivenessPass(PASS), true);
  const loaded = await loadLivenessPass(now);
  assert.equal(loaded?.ticket, PASS);
  assert.ok(loaded!.usableUntil > now);

  assert.equal(await loadLivenessPass(now + TICKET_TTL_MS), null);
  assert.equal(mem.m.size, 0, "the expired pass is gone");

  await saveLivenessPass(PASS);
  await clearLivenessPass();
  assert.equal(await loadLivenessPass(), null);
});

async function saveOneReport(): Promise<Call[]> {
  const calls: Call[] = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), body: String(init?.body ?? "") });
    return json({ status: "recorded" });
  }) as typeof fetch;
  process.env.EXPO_PUBLIC_API_URL = "https://api.example.test";
  __setCaptureProofForTest((async () => ({ proofHash: "a".repeat(64) })) as never);
  startDraft("water-pump-repair");
  addPhoto({ uri: "file:///a.jpg", bytes: new Uint8Array([1]), stepIndex: 0 });
  return calls;
}

const settle = () => new Promise((r) => setTimeout(r, 20));

test("saved report: with the flag on, the stored pass is attached to the first proof via /liveness-result", async () => {
  await saveLivenessPass(PASS);
  process.env.EXPO_PUBLIC_LIVENESS_PROVIDER = "aws";
  const calls = await saveOneReport();
  assert.equal((await saveDraft()).saved, 1);
  await settle();
  const attach = calls.filter((c) => c.url === "https://api.example.test/liveness-result");
  assert.equal(attach.length, 1);
  assert.deepEqual(JSON.parse(attach[0]!.body), { proofHash: "a".repeat(64), ticket: PASS });
  assert.deepEqual(__pendingLiveness(), []);
});

test("saved report: flag off (production default) never reads or sends the pass", async () => {
  await saveLivenessPass(PASS);
  const calls = await saveOneReport();
  assert.equal((await saveDraft()).saved, 1);
  await settle();
  assert.equal(calls.some((c) => c.url.includes("liveness")), false);
});

test("saved report: no pass stored means no attach, and the report still saves", async () => {
  process.env.EXPO_PUBLIC_LIVENESS_PROVIDER = "aws";
  const calls = await saveOneReport();
  assert.equal((await saveDraft()).saved, 1);
  await settle();
  assert.equal(calls.length, 0);
});

test("saved report: a per-report identity-step ticket wins over the device pass", async () => {
  await saveLivenessPass(PASS);
  process.env.EXPO_PUBLIC_LIVENESS_PROVIDER = "aws";
  const calls = await saveOneReport();
  const own = ticket(false, false);
  setLiveness(true, false, false, own);
  await saveDraft();
  await settle();
  const attach = calls.filter((c) => c.url === "https://api.example.test/liveness-result");
  assert.equal(attach.length, 1);
  assert.equal(JSON.parse(attach[0]!.body).ticket, own);
});

// ---- Copy and wiring -------------------------------------------------------------------------------

const read = (rel: string) => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");
const uiText = (src: string) => src.replace(/^\s*\/\/.*$/gm, "");

test("outcome copy: every non-pass says reporting still works; only a pass is success", () => {
  const outcomes = [
    { state: "not-confirmed" },
    { state: "incomplete" },
    ...(["off", "not-configured", "no-module", "rate-limited", "api", "network"] as const).map((reason) => ({ state: "unavailable", reason })),
  ] as Parameters<typeof outcomeCopy>[0][];
  for (const o of outcomes) {
    const c = outcomeCopy(o);
    assert.notEqual(c.tone, "success", JSON.stringify(o));
    assert.match(c.body, /report/i, `${JSON.stringify(o)} must say reporting still works`);
  }
  const passed = outcomeCopy({ state: "passed", ticket: PASS });
  assert.equal(passed.tone, "success");
  assert.match(passed.body, /No image of your face was kept/);
  assert.equal(outcomeCopy({ state: "unavailable", reason: "rate-limited" }).retry, false, "never hammer a paid route");
});

test("wiring: the face check is reachable and disclosed only when the flag is on", () => {
  const me = read("app/(tabs)/me.tsx");
  assert.match(me, /faceCheckOn \? \(\s*<Row[\s\S]*?router\.push\("\/face-check"\)/);
  const privacy = read("app/data-privacy.tsx");
  assert.match(privacy, /\.\.\.\(livenessProvider\(\) === "aws" \? \[FACE_CHECK\] : \[\]\)/);
  assert.match(privacy, /processed by Amazon Web Services \(AWS\)/);
  assert.match(privacy, /No image of your face is stored by Prufture/);
  assert.match(privacy, /keeps only a pass or fail/);
  assert.match(read("app/_layout.tsx"), /<Stack\.Screen name="face-check" \/>/);
});

test("copy honesty: no em-dash in UI strings, no identity or uniqueness claim", () => {
  for (const f of ["app/face-check.tsx", "app/data-privacy.tsx", "src/face-liveness.ts"]) {
    const src = uiText(read(f));
    assert.doesNotMatch(src, /—/, f);
    for (const claim of [/identity verified/i, /verifies your identity/i, /unique person/i, /hardware attestation/i, /\bTEE\b/]) {
      assert.doesNotMatch(src, claim, `${f}: ${claim}`);
    }
  }
});

test("camera permission copy covers the face check and promises no face storage", () => {
  const app = JSON.parse(read("app.json"));
  const ios = app.expo.ios.infoPlist.NSCameraUsageDescription as string;
  const plugin = (app.expo.plugins as unknown[]).find((p) => Array.isArray(p) && p[0] === "expo-camera") as [string, { cameraPermission: string }];
  assert.equal(plugin[1].cameraPermission, ios, "plugin and Info.plist must say the same thing");
  assert.match(ios, /only if you choose, for a live-person face check/);
  assert.match(ios, /never stores an image of your face/);
});
