// coordinator-summary.test.ts: the coordinator screen's summary and the "Email summary" draft. The
// summary counts review states and the busiest activities; the email carries only those counts,
// activity names and the dashboard link (where the full list and CSV live), never a report hash,
// an area or a note.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { CoordinatorReport } from "../src/coordinator-api.js";
import { coordinatorSummary, summaryEmail, summaryMailto } from "../src/coordinator-summary.js";

const row = (over: Partial<CoordinatorReport>): CoordinatorReport => ({
  proofHash: "a".repeat(64),
  taskId: "cold-chain-bogota",
  geohashRegion: "d2g62",
  capturedAt: "2026-09-29T10:00:00.000Z",
  attestationCount: 1,
  reviewStatus: "pending",
  reviewNote: "private reviewer note",
  reviewedAt: "",
  ...over,
});

const rows = [
  row({ taskId: "cold-chain-bogota", capturedAt: "2026-09-30T09:21:26.846Z" }),
  row({ taskId: "cold-chain-bogota", reviewStatus: "accepted" }),
  row({ taskId: "handwashing-lima", reviewStatus: "rejected" }),
  row({ taskId: "water-pump-repair" }),
  row({ taskId: "latrine-construction" }),
];

test("summary counts states, lists the busiest activities first, and the latest report time", () => {
  const s = coordinatorSummary(rows);
  assert.equal(s.total, 5);
  assert.deepEqual(s.counts, { pending: 3, accepted: 1, rejected: 1 });
  assert.equal(s.topActivities.length, 3);
  assert.deepEqual(s.topActivities[0], { title: "Check the new vaccine fridge at the health centre", count: 2 });
  assert.equal(s.latestAt, "2026-09-30T09:21:26.846Z");
  assert.deepEqual(coordinatorSummary([]), { total: 0, counts: { pending: 0, accepted: 0, rejected: 0 }, topActivities: [], latestAt: null });
});

test("the email carries counts, activity names and the dashboard link only", () => {
  const { subject, body } = summaryEmail(coordinatorSummary(rows), "https://prufture.vercel.app/dashboard");
  assert.equal(subject, "Prufture reports summary: 3 to review");
  assert.match(body, /5 reports: 3 to review, 1 accepted, 1 rejected\./);
  assert.match(body, /Check the new vaccine fridge at the health centre: 2/);
  assert.match(body, /Full list and CSV export: https:\/\/prufture\.vercel\.app\/dashboard/);
  for (const leak of ["a".repeat(12), "d2g62", "private reviewer note"]) {
    assert.ok(!body.includes(leak), `email must not include ${leak}`);
  }
});

test("mailto leaves the recipient to the coordinator and encodes subject and body", () => {
  const url = summaryMailto({ subject: "A & B", body: "line 1\nline 2" });
  assert.equal(url, "mailto:?subject=A%20%26%20B&body=line%201%0Aline%202");
});

test("the screen shows the summary and emails it; the CSV export lives on the web dashboard", () => {
  const coordinator = readFileSync(new URL("../app/coordinator.tsx", import.meta.url), "utf8");
  assert.match(coordinator, /coordinatorSummary\(/);
  assert.match(coordinator, /Linking\.openURL\(summaryMailto\(/);
  assert.match(coordinator, /label="Email summary"/);
  assert.doesNotMatch(coordinator, /fetchCoordinatorCsv|Export as CSV/);
  const paywall = readFileSync(new URL("../app/paywall.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(paywall, /CSV/, "the plan must not promise an in-app CSV it no longer has");
  assert.match(paywall, /a summary you can email/);
});
