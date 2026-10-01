// coordinator.ts: the paid surface — gates /coordinator/* on a SERVER-side RevenueCat entitlement
// and holds the review workflow + CSV export. Fails CLOSED (503 when the check is degraded, never
// "allow anyway"); a client-reported boolean is never trusted and no reviewer identity is stored.

import { csvCell } from "@proof/core";
import type { Context, Next } from "hono";
import { checkEntitlement } from "./entitlement.js";
import type { Entry } from "./store.js";

/** Header carrying the RevenueCat app user id. Anonymous by construction — never an email/phone. */
export const APP_USER_HEADER = "x-app-user-id";

export type ReviewStatus = "pending" | "accepted" | "rejected";

export const REVIEW_STATUSES: readonly ReviewStatus[] = ["pending", "accepted", "rejected"];

/** Free-text coordinator note cap. Kept small — this is a triage note, not a case file. */
export const REVIEW_NOTE_MAX = 500;

export function isReviewStatus(v: unknown): v is ReviewStatus {
  return typeof v === "string" && (REVIEW_STATUSES as readonly string[]).includes(v);
}

/**
 * Hono middleware for every /coordinator/* route.
 *  - no app user id            -> 401
 *  - entitlement check degraded -> 503 (fail closed; the caller retries, nothing leaks)
 *  - not entitled               -> 402
 *  - entitled                   -> next()
 * The secret key and the RevenueCat response never reach the response body.
 */
export async function requireCoordinator(c: Context, next: Next) {
  const appUserId = c.req.header(APP_USER_HEADER)?.trim() ?? "";
  if (!appUserId) {
    return c.json({ error: "missing app user id", header: APP_USER_HEADER }, 401);
  }

  const result = await checkEntitlement(appUserId);
  if (!result.available) {
    // Degraded, NOT denied. Saying "not entitled" here would be a lie about the customer.
    return c.json({ error: "entitlement check unavailable", degraded: true }, 503);
  }
  if (!result.data.entitled) {
    return c.json({ error: "coordinator_pro required", entitled: false }, 402);
  }

  await next();
}

/**
 * Coordinator view of one proof. Still zero-PII: the coarse region only, never the precise
 * location cipher, never a signature or public key. The extra a coordinator gets over the
 * public page is the review state and the note — never a reporter identity.
 */
export interface CoordinatorRow {
  proofHash: string;
  taskId: string;
  geohashRegion: string;
  capturedAt: string;
  attestationCount: number;
  /** Two pass-carrying reports of this task nearby: the public /verify rule (confirmations.ts). */
  communityConfirmed: boolean;
  reviewStatus: ReviewStatus;
  reviewNote: string;
  reviewedAt: string;
}

export function toCoordinatorRow(entry: Entry, regionLen: number, communityConfirmed: boolean): CoordinatorRow {
  return {
    proofHash: entry.payload.proofHash,
    taskId: entry.payload.taskId,
    geohashRegion: entry.payload.geohash.slice(0, regionLen),
    capturedAt: entry.payload.capturedAt,
    attestationCount: entry.attestations.length,
    communityConfirmed,
    reviewStatus: entry.review?.status ?? "pending",
    reviewNote: entry.review?.note ?? "",
    reviewedAt: entry.review?.reviewedAt ?? "",
  };
}

export const CSV_HEADER = [
  "proofHash",
  "taskId",
  "geohashRegion",
  "capturedAt",
  "attestationCount",
  "communityConfirmed",
  "reviewStatus",
  "reviewNote",
  "reviewedAt",
] as const;

/** CSV of the coordinator rows. Built from CoordinatorRow only, so it cannot leak a field
 *  that view was not allowed to carry. */
export function toCsv(rows: CoordinatorRow[]): string {
  const lines = [CSV_HEADER.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.proofHash,
        r.taskId,
        r.geohashRegion,
        r.capturedAt,
        String(r.attestationCount),
        String(r.communityConfirmed),
        r.reviewStatus,
        r.reviewNote,
        r.reviewedAt,
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return lines.join("\r\n");
}
