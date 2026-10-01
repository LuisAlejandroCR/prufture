// local-notices.test.ts: notices the phone works out for itself and shows as local notifications, so
// no server or push service ever learns who to tell. Nearby missions, a report confirmed by the
// community and a programme photo request; each can be switched off, and none repeats.

import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DEFAULT_PREFS,
  MAX_CONFIRMATION_CHECKS,
  __setNoticeStore,
  loadNoticePrefs,
  missionsReminder,
  newSinceLastVisit,
  readLastCoordinatorVisit,
  runReportNotices,
  scheduleMissionsReminder,
  setNoticePref,
  writeLastCoordinatorVisit,
} from "../src/local-notices.js";
import type { LocalProof } from "../src/queue-row.js";

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

beforeEach(() => __setNoticeStore(memStore()));
afterEach(() => __setNoticeStore(null));

const API = "https://api.example.test";
const h = (c: string) => c.repeat(64);

function row(over: Partial<LocalProof>): LocalProof {
  return {
    id: over.proofHash ?? h("a"),
    proofHash: h("a"),
    taskId: "cold-chain-bogota",
    geohash: "d2g38",
    capturedAt: "2026-09-30T10:00:00.000Z",
    signature: "s",
    publicKey: "k",
    status: "attested",
    mediaUri: "file:///x.jpg",
    attestationCount: 1,
    createdAt: "2026-09-30T10:00:00.000Z",
    reportId: "r1",
    ...over,
  } as LocalProof;
}

/** Confirmations api: every report near the assignment and pass-confirmed. */
const confirmed = (n: number) =>
  (async () =>
    new Response(
      JSON.stringify({
        reports: Array.from({ length: n }, (_, i) => ({
          own: i === 0,
          geohashRegion: "d2g38",
          verifiedPerson: true,
          verifiedPersonDegraded: false,
          membershipVerified: true,
        })),
      }),
      { status: 200 },
    )) as unknown as typeof fetch;

function shows() {
  const shown: { title: string; body: string }[] = [];
  return { shown, show: async (title: string, body: string) => void shown.push({ title, body }) };
}

test("preferences default to on and remember a switch", async () => {
  assert.deepEqual(await loadNoticePrefs(), DEFAULT_PREFS);
  await setNoticePref("confirmations", false);
  assert.equal((await loadNoticePrefs()).confirmations, false);
  assert.equal((await loadNoticePrefs()).missions, true);
});

test("a report confirmed by the community is announced once", async () => {
  const s = shows();
  const rows = [row({ proofHash: h("a"), reportId: "r1" }), row({ proofHash: h("b"), reportId: "r1" })];
  const deps = { fetchImpl: confirmed(3), show: s.show, pendingRequests: async () => [], identityStep: false };
  await runReportNotices(API, rows, deps);
  await runReportNotices(API, rows, deps);
  assert.equal(s.shown.length, 1);
  assert.match(s.shown[0]!.title, /confirmed by the community/i);
});

test("not yet confirmed, a self-started report, or an unsent one: nothing", async () => {
  const s = shows();
  const rows = [
    row({ reportId: "r1" }),
    row({ proofHash: h("c"), reportId: "r2", taskId: "item:water-point" }),
    row({ proofHash: h("d"), reportId: "r3", status: "pending_sync" }),
  ];
  await runReportNotices(API, rows, { fetchImpl: confirmed(1), show: s.show, pendingRequests: async () => [], identityStep: false });
  assert.equal(s.shown.length, 0);
});

test("a programme photo request on one of this phone's proofs is announced once, and says nothing is sent", async () => {
  const s = shows();
  const rows = [row({ proofHash: h("e"), reportId: "r1", taskId: "item:water-point" })];
  const deps = { fetchImpl: confirmed(0), show: s.show, pendingRequests: async () => [h("e"), h("f")], identityStep: false };
  await runReportNotices(API, rows, deps);
  await runReportNotices(API, rows, deps);
  assert.equal(s.shown.length, 1);
  assert.match(s.shown[0]!.title, /photo/i);
  assert.match(s.shown[0]!.body, /unless you approve/i);
});

test("switched-off notices are never shown, and no confirmation is fetched", async () => {
  await setNoticePref("confirmations", false);
  await setNoticePref("photoRequests", false);
  const s = shows();
  let fetched = 0;
  const fetchImpl = (async () => {
    fetched++;
    return new Response("{}", { status: 200 });
  }) as unknown as typeof fetch;
  await runReportNotices(API, [row({})], { fetchImpl, show: s.show, pendingRequests: async () => [h("a")], identityStep: false });
  assert.equal(s.shown.length, 0);
  assert.equal(fetched, 0);
});

test("confirmation checks per run are capped, newest reports first", async () => {
  let fetched = 0;
  const fetchImpl = (async () => {
    fetched++;
    return new Response(JSON.stringify({ reports: [] }), { status: 200 });
  }) as unknown as typeof fetch;
  const rows = Array.from({ length: MAX_CONFIRMATION_CHECKS + 5 }, (_, i) =>
    row({ proofHash: i.toString(16).padStart(64, "0"), reportId: `r${i}` }),
  );
  await runReportNotices(API, rows, { fetchImpl, show: shows().show, pendingRequests: async () => [], identityStep: false });
  assert.equal(fetched, MAX_CONFIRMATION_CHECKS);
});

test("an unreachable api or a throwing notification never throws", async () => {
  const fetchImpl = (async () => {
    throw new Error("offline");
  }) as unknown as typeof fetch;
  const show = async () => {
    throw new Error("no permission");
  };
  await assert.doesNotReject(
    runReportNotices(API, [row({})], { fetchImpl, show, pendingRequests: async () => [h("a")], identityStep: false }),
  );
});

test("nearby missions reminder: weekly when there is something near, cancelled otherwise", async () => {
  assert.equal(missionsReminder(0), null);
  assert.match(missionsReminder(1)!.body, /1 mission near you/);
  assert.match(missionsReminder(3)!.body, /3 missions near you/);
  const calls: string[] = [];
  const deps = {
    schedule: async (id: string) => void calls.push(`schedule:${id}`),
    cancel: async (id: string) => void calls.push(`cancel:${id}`),
  };
  await scheduleMissionsReminder(2, deps);
  await scheduleMissionsReminder(0, deps);
  await setNoticePref("missions", false);
  await scheduleMissionsReminder(2, deps);
  assert.deepEqual(calls, ["cancel:nearby-missions", "schedule:nearby-missions", "cancel:nearby-missions", "cancel:nearby-missions"]);
});

test("coordinator: reports newer than the last visit, and the visit is remembered", async () => {
  const rows = [{ capturedAt: "2026-09-29T10:00:00.000Z" }, { capturedAt: "2026-09-30T10:00:00.000Z" }];
  assert.equal(newSinceLastVisit(rows, null), 0, "first visit: nothing is 'new'");
  assert.equal(newSinceLastVisit(rows, Date.parse("2026-09-29T12:00:00.000Z")), 1);
  await writeLastCoordinatorVisit(123);
  assert.equal(await readLastCoordinatorVisit(), 123);
});

test("screens: Notifications settings from Me, and the coordinator's new-since-last-visit line", () => {
  const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
  const me = read("app/(tabs)/me.tsx");
  assert.match(me, /title="Notifications"[\s\S]*?router\.push\("\/notifications"\)/);
  const screen = read("app/notifications.tsx");
  for (const key of ["missions", "confirmations", "photoRequests"]) assert.match(screen, new RegExp(`setNoticePref\\("${key}"`));
  assert.match(screen, /only on this phone/i);
  assert.match(read("app/_layout.tsx"), /<Stack\.Screen name="notifications" \/>/);
  assert.match(read("app/_layout.tsx"), /runReportNotices\(API_URL, rows\)/);
  assert.match(read("app/(tabs)/index.tsx"), /scheduleMissionsReminder\(/);
  const coordinator = read("app/coordinator.tsx");
  assert.match(coordinator, /newSinceLastVisit\(/);
  assert.match(coordinator, /since your last visit/);
});
