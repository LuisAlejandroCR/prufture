// coordinator-api.test.ts: the client for the paid /coordinator/* routes, plus static guards that the
// paywall carries what App Store guideline 3.1.2 asks of a subscription screen.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  APP_USER_HEADER,
  fetchCoordinatorCsv,
  fetchCoordinatorReports,
  recordReview,
  reviewCounts,
  type CoordinatorReport,
} from "../src/coordinator-api";

const row: CoordinatorReport = {
  proofHash: "ab".repeat(32),
  taskId: "solar-kalama",
  geohashRegion: "kzf0",
  capturedAt: "2026-09-20T10:00:00.000Z",
  attestationCount: 1,
  reviewStatus: "pending",
  reviewNote: "",
  reviewedAt: "",
};

function fakeFetch(status: number, body: unknown, seen: { url?: string; init?: RequestInit } = {}) {
  return (async (url: string, init?: RequestInit) => {
    seen.url = url;
    seen.init = init;
    const text = typeof body === "string" ? body : JSON.stringify(body);
    return new Response(text, { status });
  }) as unknown as typeof fetch;
}

test("reports: sends the anonymous app user id and returns the rows", async () => {
  const seen: { url?: string; init?: RequestInit } = {};
  const result = await fetchCoordinatorReports("https://api.test/", "$RCAnonymousID:1", fakeFetch(200, [row], seen));
  assert.deepEqual(result, { kind: "ok", data: [row] });
  assert.equal(seen.url, "https://api.test/coordinator/reports");
  assert.equal((seen.init?.headers as Record<string, string>)[APP_USER_HEADER], "$RCAnonymousID:1");
});

test("402 from the server is locked, whatever the SDK said", async () => {
  assert.deepEqual(await fetchCoordinatorReports("https://api.test", "u", fakeFetch(402, {})), { kind: "locked" });
});

test("401, 503, bad bodies and thrown fetches are unavailable, never locked", async () => {
  for (const status of [401, 500, 503]) {
    assert.deepEqual(await fetchCoordinatorReports("https://api.test", "u", fakeFetch(status, {})), { kind: "unavailable" });
  }
  assert.deepEqual(await fetchCoordinatorReports("https://api.test", "u", fakeFetch(200, { rows: [] })), { kind: "unavailable" });
  const throwing = (async () => {
    throw new Error("offline");
  }) as unknown as typeof fetch;
  assert.deepEqual(await fetchCoordinatorReports("https://api.test", "u", throwing), { kind: "unavailable" });
  assert.deepEqual(await fetchCoordinatorCsv("https://api.test", "u", throwing), { kind: "unavailable" });
});

test("review: posts the verdict and returns the updated row", async () => {
  const seen: { url?: string; init?: RequestInit } = {};
  const updated = { ...row, reviewStatus: "accepted" as const };
  const result = await recordReview(
    "https://api.test",
    "u",
    { proofHash: row.proofHash, status: "accepted" },
    fakeFetch(200, { status: "recorded", review: updated }, seen),
  );
  assert.deepEqual(result, { kind: "ok", data: updated });
  assert.equal(seen.url, "https://api.test/coordinator/review");
  assert.equal(seen.init?.method, "POST");
  assert.deepEqual(JSON.parse(String(seen.init?.body)), { proofHash: row.proofHash, status: "accepted", note: "" });
});

test("export: returns the CSV text", async () => {
  const csv = "proofHash,taskId\nab,solar\n";
  assert.deepEqual(await fetchCoordinatorCsv("https://api.test", "u", fakeFetch(200, csv)), { kind: "ok", data: csv });
});

test("reviewCounts tallies each state", () => {
  const rows = [row, { ...row, reviewStatus: "accepted" as const }, { ...row, reviewStatus: "accepted" as const }];
  assert.deepEqual(reviewCounts(rows), { pending: 1, accepted: 2, rejected: 0 });
});

const paywall = readFileSync(new URL("../app/paywall.tsx", import.meta.url), "utf8");
const coordinator = readFileSync(new URL("../app/coordinator.tsx", import.meta.url), "utf8");
const me = readFileSync(new URL("../app/(tabs)/me.tsx", import.meta.url), "utf8");
const strip = (src: string) => src.replace(/^\s*\/\/.*$/gm, "");

test("paywall links Terms of Use and Privacy Policy and states price per period", () => {
  assert.match(paywall, /label="Terms of Use" url=\{TERMS_OF_USE_URL\}/);
  assert.match(paywall, /label="Privacy Policy" url=\{PRIVACY_URL\}/);
  assert.match(paywall, /"month" : "year"/);
  assert.match(paywall, /Restore purchases/);
});

test("paywall only promises what the coordinator screen actually does", () => {
  assert.doesNotMatch(paywall, /dashboards|task assignment|cross-team/);
  assert.match(coordinator, /fetchCoordinatorReports/);
  assert.match(coordinator, /recordReview/);
  assert.match(coordinator, /coordinatorSummary\(/);
});

test("the paywall is reached from the coordinator screen, and that screen from Me", () => {
  assert.match(me, /router\.push\("\/coordinator"\)/);
  assert.match(coordinator, /router\.push\("\/paywall"\)/);
  assert.doesNotMatch(me, /\/paywall/);
});

test("coordinator and paywall copy keep DESIGN.md rules: no em-dash in UI strings", () => {
  assert.doesNotMatch(strip(coordinator), /—/);
  assert.doesNotMatch(strip(paywall).split("\n").slice(3).join("\n"), /—/);
});
