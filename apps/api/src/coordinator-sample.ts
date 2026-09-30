// coordinator-sample.ts: the sample inbox a coordinator_pro subscriber sees when they are not staff of
// the programme. The plan is sold to anyone, so the plan alone never opens real reports; a subscriber
// can still try the whole review flow here. Rows use the app's example assignments so their titles
// resolve, hashes that no real proof can have, and reviews kept per subscriber in memory (a restart
// resets a sample inbox, which costs nothing).

import { createHash } from "node:crypto";
import type { CoordinatorRow, ReviewStatus } from "./coordinator.js";

/** Response header on a sample answer, so a client can label it. Old clients ignore it. */
export const SAMPLE_HEADER = "x-prufture-sample";

/** Sample inboxes kept at once; the oldest is dropped first. Bounds memory against many callers. */
export const MAX_SAMPLE_INBOXES = 500;

const DAY_MS = 24 * 60 * 60 * 1000;

interface SampleSeed {
  taskId: string;
  cell: string;
  daysAgo: number;
  status: ReviewStatus;
  note: string;
}

// The app's example assignments (apps/frontend/src/tasks.ts) and their coarse cells.
const SEEDS: SampleSeed[] = [
  { taskId: "cold-chain-bogota", cell: "d2g38", daysAgo: 1, status: "pending", note: "" },
  { taskId: "water-pump-repair", cell: "sb8v1", daysAgo: 1, status: "pending", note: "" },
  { taskId: "solar-panel-install", cell: "kzdwb", daysAgo: 2, status: "pending", note: "" },
  { taskId: "cold-chain-bogota", cell: "d2g38", daysAgo: 3, status: "pending", note: "" },
  { taskId: "handwashing-lima", cell: "6mc5z", daysAgo: 5, status: "accepted", note: "Stations working" },
  { taskId: "latrine-construction", cell: "kzujq", daysAgo: 8, status: "rejected", note: "Photo shows another site" },
];

const sampleHash = (i: number) => createHash("sha256").update(`prufture-sample-report|${i}`).digest("hex");
const SAMPLE_HASHES = SEEDS.map((_, i) => sampleHash(i));
const SAMPLE_SET = new Set(SAMPLE_HASHES);

/** True for a sample row's hash. Real proof hashes are content hashes and never collide with these. */
export function isSampleHash(hash: string): boolean {
  return SAMPLE_SET.has(hash);
}

type Review = { status: ReviewStatus; note: string; reviewedAt: string };
const inboxes = new Map<string, Map<string, Review>>();

function inboxFor(appUserId: string): Map<string, Review> {
  let inbox = inboxes.get(appUserId);
  if (inbox) {
    // Refresh recency so an active subscriber is not the one evicted.
    inboxes.delete(appUserId);
  } else {
    inbox = new Map();
    if (inboxes.size >= MAX_SAMPLE_INBOXES) inboxes.delete(inboxes.keys().next().value!);
  }
  inboxes.set(appUserId, inbox);
  return inbox;
}

/** The subscriber's sample rows, newest first, with their own reviews applied. */
export function sampleRows(appUserId: string, now = Date.now()): CoordinatorRow[] {
  const inbox = inboxFor(appUserId);
  return SEEDS.map((seed, i) => {
    const hash = SAMPLE_HASHES[i]!;
    const review = inbox.get(hash);
    return {
      proofHash: hash,
      taskId: seed.taskId,
      geohashRegion: seed.cell,
      // Whole days back from today, so the sample always looks recent.
      capturedAt: new Date(Math.floor(now / DAY_MS) * DAY_MS - seed.daysAgo * DAY_MS + 10 * 60 * 60 * 1000).toISOString(),
      attestationCount: 1,
      reviewStatus: review?.status ?? seed.status,
      reviewNote: review?.note ?? seed.note,
      reviewedAt: review?.reviewedAt ?? (seed.status === "pending" ? "" : new Date(now - seed.daysAgo * DAY_MS).toISOString()),
    };
  });
}

/** Record a review on the subscriber's own sample row. null when the hash is not a sample row. */
export function setSampleReview(appUserId: string, hash: string, review: Review): CoordinatorRow | null {
  if (!isSampleHash(hash)) return null;
  inboxFor(appUserId).set(hash, review);
  return sampleRows(appUserId).find((r) => r.proofHash === hash) ?? null;
}

/** Test-only: forget every sample inbox. */
export function __resetSampleInboxes(): void {
  inboxes.clear();
}
