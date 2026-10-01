// onesignal.test.ts: programme-wide push notices through OneSignal, which replaces the Expo push
// tokens the api used to collect and never sent to. Phase 1 has no per-person targeting: a notice
// goes to every subscribed device, carries no report reference, and the api keeps no push token.

import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { app } from "../src/index.js";
import * as store from "../src/store.js";
import { APP_USER_HEADER } from "../src/coordinator.js";
import { enrolCommitment } from "../src/personhood.js";
import { ONESIGNAL_URL, sendProgrammeNotice } from "../src/onesignal.js";

const APP_ID = "6b1f6c4a-3f3e-4a8e-9a55-2f1d9c0b7e21";
const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
  for (const k of [
    "ONESIGNAL_APP_ID",
    "ONESIGNAL_REST_API_KEY",
    "ONESIGNAL_SEGMENT",
    "REVENUECAT_SECRET_KEY",
    "REVENUECAT_PROJECT_ID",
    "REVENUECAT_COORDINATOR_ENTITLEMENT_ID",
    "PERSONHOOD_ADMIN_APP_USER_IDS",
  ]) {
    delete process.env[k];
  }
});

function configure(): void {
  process.env.ONESIGNAL_APP_ID = APP_ID;
  process.env.ONESIGNAL_REST_API_KEY = "os_v2_app_test";
}

type Sent = { url: string; init?: RequestInit };
function capture(status = 200): Sent[] {
  const sent: Sent[] = [];
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    sent.push({ url: String(url), init });
    if (String(url).includes("revenuecat")) {
      return new Response(JSON.stringify({ items: [{ entitlement_id: "entl0c00rd1n4" }] }), { status: 200 });
    }
    return new Response(JSON.stringify({ id: "notif-1" }), { status });
  }) as typeof fetch;
  return sent;
}

test("unconfigured: nothing is sent and the result says why", async () => {
  const sent = capture();
  const r = await sendProgrammeNotice({ heading: "H", body: "B" });
  assert.equal(r.available, false);
  assert.equal(sent.length, 0);
});

test("a notice goes to the subscribed segment with the app's key, and carries only its text", async () => {
  configure();
  const sent = capture();
  const r = await sendProgrammeNotice({ heading: "New round", body: "You can confirm again." });
  assert.equal(r.available, true);
  assert.equal(sent.length, 1);
  assert.equal(sent[0]!.url, ONESIGNAL_URL);
  assert.equal(sent[0]!.init?.method, "POST");
  const headers = new Headers(sent[0]!.init?.headers);
  assert.equal(headers.get("authorization"), "Key os_v2_app_test");
  assert.deepEqual(JSON.parse(String(sent[0]!.init?.body)), {
    app_id: APP_ID,
    target_channel: "push",
    included_segments: ["Total Subscriptions"],
    headings: { en: "New round" },
    contents: { en: "You can confirm again." },
  });
});

test("ONESIGNAL_SEGMENT picks another segment", async () => {
  configure();
  process.env.ONESIGNAL_SEGMENT = "Active Subscriptions";
  const sent = capture();
  await sendProgrammeNotice({ heading: "H", body: "B" });
  assert.deepEqual(JSON.parse(String(sent[0]!.init?.body)).included_segments, ["Active Subscriptions"]);
});

test("a refused or unreachable OneSignal degrades typed, never throws", async () => {
  configure();
  capture(400);
  assert.equal((await sendProgrammeNotice({ heading: "H", body: "B" })).available, false);
  globalThis.fetch = (async () => {
    throw new Error("offline");
  }) as typeof fetch;
  assert.equal((await sendProgrammeNotice({ heading: "H", body: "B" })).available, false);
});

test("starting a new round sends one programme notice", async () => {
  configure();
  store.__setStorePathForTests(join(tmpdir(), `prufture-os-${randomUUID()}.json`));
  process.env.REVENUECAT_SECRET_KEY = "sk_test_os";
  process.env.REVENUECAT_PROJECT_ID = "proj1ab2c3d4";
  process.env.REVENUECAT_COORDINATOR_ENTITLEMENT_ID = "entl0c00rd1n4";
  process.env.PERSONHOOD_ADMIN_APP_USER_IDS = "admin-1";
  store.putPersonhoodGroup("pilot-1", enrolCommitment(undefined, "12345").group);
  const sent = capture();
  const res = await app.request("/coordinator/personhood/epoch", {
    method: "POST",
    headers: { "content-type": "application/json", [APP_USER_HEADER]: "admin-1" },
    body: JSON.stringify({ programmeId: "pilot-1" }),
  });
  assert.equal(res.status, 200);
  const notices = sent.filter((s) => s.url === ONESIGNAL_URL);
  assert.equal(notices.length, 1);
  const body = JSON.parse(String(notices[0]!.init?.body));
  assert.match(body.headings.en, /new round/i);
  assert.doesNotMatch(JSON.stringify(body), /pilot-1|[0-9a-f]{64}/, "no programme id or report reference");
});

test("the api no longer collects push tokens", async () => {
  const res = await app.request("/register-push", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ deviceId: "a1b2c3d4e5f60718", token: "ExponentPushToken[abc]" }),
  });
  assert.equal(res.status, 404);
});

test("/health says whether programme notices can be sent, never the key", async () => {
  configure();
  const on = await (await app.request("/health")).text();
  assert.equal((JSON.parse(on) as { pushNotices: boolean }).pushNotices, true);
  assert.ok(!on.includes("os_v2_app_test"));
});
