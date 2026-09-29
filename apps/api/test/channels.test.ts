// channels.test.ts: unit + fuzz + invariant tests for the delivery-channel interface.
// Proves: every channel degrades (never throws), the wire body carries ONLY the verifyUrl,
// and no PII / payload field is ever transmitted.

import { test } from "node:test";
import assert from "node:assert/strict";
import { sendVerifyUrl, type Channel } from "../src/channels.js";

const CHANNELS: Channel[] = ["whatsapp", "email", "telegram"];
const CHANNEL_KEYS = [
  "KAPSO_API_KEY",
  "KAPSO_PHONE_NUMBER_ID",
  "EMAIL_API_KEY",
  "EMAIL_FROM",
  "TELEGRAM_BOT_TOKEN",
];

function clearEnv() {
  for (const k of CHANNEL_KEYS) delete process.env[k];
}
function configureAll() {
  process.env.KAPSO_API_KEY = "k";
  process.env.KAPSO_PHONE_NUMBER_ID = "111";
  process.env.EMAIL_API_KEY = "e";
  process.env.EMAIL_FROM = "bot@prufture.test";
  process.env.TELEGRAM_BOT_TOKEN = "t";
}

const realFetch = globalThis.fetch;
function stubFetch(capture: { url: string; body: string }[], status = 200) {
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    capture.push({ url: String(url), body: String(init?.body ?? "") });
    return new Response(JSON.stringify({ id: "msg_1", ok: true, result: { message_id: 7 } }), {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
}
function restoreFetch() {
  globalThis.fetch = realFetch;
}

const rand = (n: number) => Math.floor(Math.random() * n);
const junk = () =>
  Array.from({ length: 1 + rand(24) }, () => String.fromCharCode(33 + rand(94))).join("");

test("unconfigured: every channel degrades to a typed unavailable, never throws", async () => {
  clearEnv();
  for (const channel of CHANNELS) {
    const r = await sendVerifyUrl(channel, "recipient", "https://x/verify/abc");
    assert.equal(r.available, false);
    assert.equal(r.source, `channel/${channel}`);
    assert.equal(r.data, null);
    assert.match(r.error, /not configured/);
  }
});

test("unknown channel degrades", async () => {
  const r = await sendVerifyUrl("carrier-pigeon" as Channel, "to", "https://x");
  assert.equal(r.available, false);
});

test("fuzz: hostile inputs never throw and keep the source tag", async () => {
  clearEnv();
  for (let i = 0; i < 400; i++) {
    const channel = CHANNELS[rand(CHANNELS.length)]!;
    const r = await sendVerifyUrl(channel, junk(), junk());
    assert.equal(r.available, false);
    assert.equal(r.source, `channel/${channel}`);
  }
});

test("invariant: the wire body carries the url and no PII / payload field", async () => {
  configureAll();
  // Short coordinate names are checked as JSON keys: as bare substrings "lat" matches "template".
  const forbidden = ["signature", "publicKey", "mediaUri", "privateKey", '"lat"', '"lng"', "0xdeadbeef"];
  try {
    for (let i = 0; i < 120; i++) {
      const channel = CHANNELS[rand(CHANNELS.length)]!;
      const url = `https://prufture.test/verify/${Array.from({ length: 8 + rand(56) }, () => "0123456789abcdef"[rand(16)]).join("")}`;
      const cap: { url: string; body: string }[] = [];
      stubFetch(cap);
      const r = await sendVerifyUrl(channel, "recipient-" + i, url);
      assert.equal(r.available, true, `${channel} should succeed with stubbed fetch`);
      assert.equal(cap.length, 1);
      assert.ok(cap[0]!.body.includes(url), `${channel} body must contain the verifyUrl`);
      for (const f of forbidden) {
        assert.ok(!cap[0]!.body.includes(f), `${channel} body must not contain "${f}"`);
      }
    }
  } finally {
    restoreFetch();
    clearEnv();
  }
});

test("invariant: provider non-2xx degrades, does not throw", async () => {
  configureAll();
  try {
    stubFetch([], 500);
    for (const channel of CHANNELS) {
      const r = await sendVerifyUrl(channel, "to", "https://x/verify/y");
      assert.equal(r.available, false);
      assert.equal(r.source, `channel/${channel}`);
    }
  } finally {
    restoreFetch();
    clearEnv();
  }
});

test("whatsapp: exact Kapso v24 endpoint, X-API-Key, and the report_ready template with only the url", async () => {
  configureAll();
  delete process.env.KAPSO_API_BASE;
  delete process.env.KAPSO_TEMPLATE_NAME;
  delete process.env.KAPSO_TEMPLATE_LANG;
  const calls: { url: string; init?: RequestInit }[] = [];
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({ messaging_product: "whatsapp", messages: [{ id: "wamid.X" }] }), { status: 200 });
  }) as typeof fetch;
  try {
    const r = await sendVerifyUrl("whatsapp", "46701234567", "https://prufture.vercel.app/verify/0xabc");
    assert.equal(calls[0]!.url, "https://api.kapso.ai/meta/whatsapp/v24.0/111/messages");
    assert.equal((calls[0]!.init?.headers as Record<string, string>)["X-API-Key"], "k");
    assert.deepEqual(JSON.parse(String(calls[0]!.init?.body)), {
      messaging_product: "whatsapp",
      to: "46701234567",
      type: "template",
      template: {
        name: "report_ready",
        language: { code: "en" },
        components: [{ type: "body", parameters: [{ type: "text", text: "https://prufture.vercel.app/verify/0xabc" }] }],
      },
    });
    assert.ok(r.available && r.data.providerId === "wamid.X");
  } finally {
    restoreFetch();
  }
});

test("whatsapp: a Meta error surfaces as a typed unavailable", async () => {
  configureAll();
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ error: { code: 132001, message: "Template name does not exist" } }), { status: 400 })) as typeof fetch;
  try {
    const r = await sendVerifyUrl("whatsapp", "46701234567", "https://x/verify/1");
    assert.equal(r.available, false);
    assert.match(r.error ?? "", /kapso 400: .*132001/);
  } finally {
    restoreFetch();
  }
});
