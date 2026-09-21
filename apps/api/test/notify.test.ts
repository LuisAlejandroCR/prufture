// notify.test.ts: the programme auto-notification on /sync (and /attest).
// Proves: off by default; exactly one send per reportId (deduped across proofs); trigger gating;
// a down channel keeps /sync at 200 and does NOT lock the dedup key; the wire body is url-only
// with no PII; and reportId / notifiedKey never appear on a public route.

import { test } from "node:test";
import assert from "node:assert/strict";
import { signPayload, generateKeyPair } from "@proof/core";

const kp = generateKeyPair();

const CHANNEL_ENV = ["NOTIFY_ENABLED", "NOTIFY_ON", "PROGRAMME_EMAIL", "PROGRAMME_WHATSAPP",
  "EMAIL_API_KEY", "EMAIL_FROM", "KAPSO_API_KEY", "KAPSO_PHONE_NUMBER_ID"];
function clearNotifyEnv() {
  for (const k of CHANNEL_ENV) delete process.env[k];
}

const realFetch = globalThis.fetch;
function stubFetch(capture: { url: string; body: string }[], ok = true) {
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    capture.push({ url: String(url), body: String(init?.body ?? "") });
    return new Response(JSON.stringify({ id: "prov_1" }), {
      status: ok ? 200 : 500,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
}

let seq = 0;
const hash = () => (seq++).toString(16).padStart(2, "0").repeat(32); // 64 hex chars, unique
function proof(h: string, extra: Record<string, unknown> = {}) {
  const p = signPayload(
    { proofHash: h, taskId: "solar-panel-installation", geohash: "9q8yy", capturedAt: "2026-09-06T14:32:00.000Z" },
    kp.privateKey,
  );
  return { ...p, ...extra };
}
type App = { request: (p: string, init: RequestInit) => Response | Promise<Response> };
const post = async (app: App, path: string, body: unknown): Promise<Response> =>
  app.request(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

test("disabled by default: maybeNotify sends nothing", async () => {
  clearNotifyEnv();
  const cap: { url: string; body: string }[] = [];
  stubFetch(cap);
  try {
    const { app } = await import("../src/index.js");
    const h = hash();
    const res = await post(app, "/sync", proof(h, { reportId: "r-disabled" }));
    assert.equal(res.status, 200);
    assert.equal(cap.length, 0, "no channel call when NOTIFY_ENABLED is unset");
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("enabled + notifyOn:sync: one send per reportId, second proof of same report does not re-send", async () => {
  clearNotifyEnv();
  process.env.NOTIFY_ENABLED = "true";
  process.env.NOTIFY_ON = "sync";
  process.env.PROGRAMME_EMAIL = "programme@unicef.example";
  process.env.EMAIL_API_KEY = "e";
  process.env.EMAIL_FROM = "bot@prufture.test";
  const cap: { url: string; body: string }[] = [];
  stubFetch(cap);
  try {
    const { app } = await import("../src/index.js");
    const h1 = hash();
    const h2 = hash();
    await post(app, "/sync", proof(h1, { reportId: "r-multi" }));
    await post(app, "/sync", proof(h2, { reportId: "r-multi" }));
    assert.equal(cap.length, 1, "exactly one programme message for a 2-photo report");
    assert.ok(cap[0]!.body.includes(`/verify/${h1}`), "url points at the first proof of the report");
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("notifyOn:sync -> /attest does not notify; notifyOn:both -> it does", async () => {
  clearNotifyEnv();
  process.env.NOTIFY_ENABLED = "true";
  process.env.PROGRAMME_EMAIL = "programme@unicef.example";
  process.env.EMAIL_API_KEY = "e";
  process.env.EMAIL_FROM = "bot@prufture.test";
  const cap: { url: string; body: string }[] = [];
  stubFetch(cap);
  try {
    const { app } = await import("../src/index.js");
    const { maybeNotify } = await import("../src/notify.js");
    const { getProof } = await import("../src/store.js");

    process.env.NOTIFY_ON = "sync";
    const hA = hash();
    await post(app, "/sync", proof(hA, { reportId: "r-attest-a" }));
    const before = cap.length; // 1 (from sync)
    await maybeNotify(getProof(hA)!, "attest");
    assert.equal(cap.length, before, "attest trigger ignored when notifyOn is 'sync'");

    // notifyOn 'attest': sync stays silent, the attest trigger is what fires.
    process.env.NOTIFY_ON = "attest";
    const hB = hash();
    await post(app, "/sync", proof(hB, { reportId: "r-attest-b" }));
    assert.equal(cap.length, before, "sync trigger ignored when notifyOn is 'attest'");
    await maybeNotify(getProof(hB)!, "attest");
    assert.equal(cap.length, before + 1, "attest trigger fires when notifyOn includes 'attest'");
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("channel down: /sync still 200 and the dedup key is NOT locked (retries next time)", async () => {
  clearNotifyEnv();
  process.env.NOTIFY_ENABLED = "true";
  process.env.NOTIFY_ON = "sync";
  process.env.PROGRAMME_EMAIL = "programme@unicef.example";
  process.env.EMAIL_API_KEY = "e";
  process.env.EMAIL_FROM = "bot@prufture.test";
  const cap: { url: string; body: string }[] = [];
  stubFetch(cap, false); // provider 500 -> channel degrades
  try {
    const { app } = await import("../src/index.js");
    const { wasNotified } = await import("../src/store.js");
    const h = hash();
    const res = await post(app, "/sync", proof(h, { reportId: "r-down" }));
    assert.equal(res.status, 200);
    assert.equal(wasNotified("r-down"), false, "no available channel -> key stays unmarked");
    assert.equal(cap.length, 1, "it did attempt the send");
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("wire body is url-only; reportId / notifiedKey never appear on a public route", async () => {
  clearNotifyEnv();
  process.env.NOTIFY_ENABLED = "true";
  process.env.NOTIFY_ON = "sync";
  process.env.PROGRAMME_EMAIL = "programme@unicef.example";
  process.env.EMAIL_API_KEY = "e";
  process.env.EMAIL_FROM = "bot@prufture.test";
  const cap: { url: string; body: string }[] = [];
  stubFetch(cap);
  try {
    const { app } = await import("../src/index.js");
    const h = hash();
    await post(app, "/sync", proof(h, { reportId: "r-shape" }));

    // The channel body legitimately carries the recipient address (that is how email/WhatsApp
    // work) and the verifyUrl — but never the proof, answers, precise location, or signature.
    const sent = cap[0]!.body;
    assert.ok(sent.includes(`/verify/${h}`), "body must carry the verifyUrl");
    for (const bad of ["signature", "publicKey", "mediaUri", "preciseLocationCipher", "9q8yyk8yuv", "r-shape"]) {
      assert.ok(!sent.includes(bad), `channel body leaked ${bad}`);
    }

    const one = JSON.stringify(await (await app.request("/proof/" + h)).json());
    const list = JSON.stringify(await (await app.request("/proofs")).json());
    for (const s of [one, list]) {
      assert.ok(!s.includes("reportId"), "reportId exposed on a public route");
      assert.ok(!s.includes("notifiedKey"), "notifiedKey exposed on a public route");
      assert.ok(!s.includes("r-shape"), "reportId value exposed on a public route");
    }
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("no reportId: dedup falls back to the lone proofHash", async () => {
  clearNotifyEnv();
  process.env.NOTIFY_ENABLED = "true";
  process.env.NOTIFY_ON = "sync";
  process.env.PROGRAMME_EMAIL = "programme@unicef.example";
  process.env.EMAIL_API_KEY = "e";
  process.env.EMAIL_FROM = "bot@prufture.test";
  const cap: { url: string; body: string }[] = [];
  stubFetch(cap);
  try {
    const { app } = await import("../src/index.js");
    const { wasNotified } = await import("../src/store.js");
    const h = hash();
    await post(app, "/sync", proof(h)); // no reportId
    await post(app, "/sync", proof(h)); // same proof again -> deduped
    assert.equal(cap.length, 1);
    assert.equal(wasNotified(h), true);
  } finally {
    globalThis.fetch = realFetch;
  }
});
