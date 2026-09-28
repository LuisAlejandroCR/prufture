// notify-route.test.ts: POST /notify is unauthenticated and proof hashes are public, so a caller-chosen
// `to` made the programme's WhatsApp/email credentials an open relay. Holds the fixed-recipient contract:
// the caller picks a channel, never a recipient, and a delivered re-send has a cooldown.

import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { signPayload, generateKeyPair } from "@proof/core";
import { app } from "../src/index.js";

const kp = generateKeyPair();
const KEYS = ["EMAIL_API_KEY", "EMAIL_FROM", "PROGRAMME_EMAIL", "KAPSO_API_KEY", "KAPSO_PHONE_NUMBER_ID", "PROGRAMME_WHATSAPP", "TELEGRAM_BOT_TOKEN", "PROGRAMME_TELEGRAM_CHAT_ID"];
let saved: Record<string, string | undefined> = {};
const realFetch = globalThis.fetch;
let sent: { url: string; body: string }[] = [];

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
  sent = [];
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    sent.push({ url: String(url), body: String(init?.body ?? "") });
    return new Response(JSON.stringify({ id: "msg_1" }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

const post = (body: unknown) =>
  app.request("/notify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

async function syncedProof(): Promise<string> {
  const proofHash = randomBytes(32).toString("hex");
  const res = await app.request("/sync", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(
      signPayload({ proofHash, taskId: "solar-panel-install", geohash: "9q8yy", capturedAt: "2026-09-06T14:32:00.000Z" }, kp.privateKey),
    ),
  });
  assert.equal(res.status, 200);
  return proofHash;
}

function configureEmail() {
  process.env.EMAIL_API_KEY = "e";
  process.env.EMAIL_FROM = "bot@prufture.test";
  process.env.PROGRAMME_EMAIL = "programme@example.org";
}

test("a caller-supplied recipient is refused and nothing is sent", async () => {
  configureEmail();
  const proofHash = await syncedProof();
  const res = await post({ proofHash, channel: "email", to: "victim@example.com" });
  assert.equal(res.status, 400);
  assert.equal(sent.length, 0);
});

test("the message goes to the configured programme recipient, and only there", async () => {
  configureEmail();
  const proofHash = await syncedProof();
  const res = await post({ proofHash, channel: "email" });
  assert.equal(res.status, 200);
  assert.equal(((await res.json()) as { sent: boolean }).sent, true);
  assert.equal(sent.length, 1);
  const wire = JSON.parse(sent[0]!.body) as { to: string; text: string };
  assert.equal(wire.to, "programme@example.org");
  assert.match(wire.text, new RegExp(`/verify/${proofHash}`));
});

test("no configured recipient for the channel degrades to sent:false without calling out", async () => {
  configureEmail();
  process.env.TELEGRAM_BOT_TOKEN = "t"; // credentials alone are not a recipient
  const proofHash = await syncedProof();
  const res = await post({ proofHash, channel: "telegram" });
  assert.equal(res.status, 200);
  const j = (await res.json()) as { sent: boolean; result: { available: boolean; error: string } };
  assert.equal(j.sent, false);
  assert.equal(j.result.available, false);
  assert.match(j.result.error, /no programme recipient/);
  assert.equal(sent.length, 0);
});

test("a delivered re-send starts a cooldown per proof and channel", async () => {
  configureEmail();
  process.env.KAPSO_API_KEY = "k";
  process.env.KAPSO_PHONE_NUMBER_ID = "111";
  process.env.PROGRAMME_WHATSAPP = "+10000000000";
  const proofHash = await syncedProof();

  assert.equal((await post({ proofHash, channel: "email" })).status, 200);
  const again = await post({ proofHash, channel: "email" });
  assert.equal(again.status, 429);
  assert.ok(Number(again.headers.get("retry-after")) > 0);
  assert.equal(sent.length, 1);

  // A different channel, or a different proof, is not held by that cooldown.
  assert.equal((await post({ proofHash, channel: "whatsapp" })).status, 200);
  assert.equal((await post({ proofHash: await syncedProof(), channel: "email" })).status, 200);
  assert.equal(sent.length, 3);
});

test("a failed delivery does not start the cooldown, so it can be retried", async () => {
  configureEmail();
  const proofHash = await syncedProof();
  globalThis.fetch = (async () => new Response("{}", { status: 503 })) as typeof fetch;
  const first = (await (await post({ proofHash, channel: "email" })).json()) as { sent: boolean };
  assert.equal(first.sent, false);

  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ id: "m" }), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch;
  const second = await post({ proofHash, channel: "email" });
  assert.equal(second.status, 200);
  assert.equal(((await second.json()) as { sent: boolean }).sent, true);
});
