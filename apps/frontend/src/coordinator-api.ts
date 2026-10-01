// coordinator-api.ts: client for the paid /coordinator/* api routes (apps/api/src/coordinator.ts).
// The server re-checks the RevenueCat entitlement on every call, so a 402 here outranks whatever the
// SDK said locally. Never throws; fetch is injected so it stays unit-testable under node.

export type ReviewStatus = "pending" | "accepted" | "rejected";

/** Mirrors CoordinatorRow on the api: coarse region and review state, never a reporter identity. */
export interface CoordinatorReport {
  proofHash: string;
  taskId: string;
  geohashRegion: string;
  capturedAt: string;
  /** On-chain records of this proof. One relayer anchors each proof once, so this is 0 or 1. */
  attestationCount: number;
  /**
   * Two pass-carrying reports of this task nearby: the rule of the public page and the dashboard.
   * Missing from an older api reads as not confirmed.
   */
  communityConfirmed?: boolean;
  reviewStatus: ReviewStatus;
  reviewNote: string;
  reviewedAt: string;
}

export type CommunityState = "confirmed" | "waiting" | "unanchored";

/**
 * Where a report stands with the community, from the api's own rule. Never inferred from the
 * on-chain count, which is a public record of the proof, not a second community report.
 */
export function communityState(row: Pick<CoordinatorReport, "attestationCount" | "communityConfirmed">): CommunityState {
  if (row.communityConfirmed === true) return "confirmed";
  return row.attestationCount >= 1 ? "waiting" : "unanchored";
}

export const COMMUNITY_LABEL: Record<CommunityState, string> = {
  confirmed: "Confirmed by the community",
  waiting: "Waiting for a second community report",
  unanchored: "Not on the public record yet",
};

/**
 * `locked`: the server says there is no active plan (402), even if the SDK disagrees.
 * `unavailable`: network, 401/503 or anything unexpected. Never read as "locked".
 */
export type CoordinatorResult<T> =
  | { kind: "ok"; data: T }
  | { kind: "locked" }
  | { kind: "unavailable" };

export const APP_USER_HEADER = "x-app-user-id";
/** Set by the api when the caller is not the programme's staff: the rows are a sample inbox. */
export const SAMPLE_HEADER = "x-prufture-sample";

/** The inbox, and whether it is the sample one a subscriber sees until the programme adds them. */
export interface CoordinatorInbox {
  rows: CoordinatorReport[];
  sample: boolean;
}

function url(base: string, path: string): string {
  return `${base.replace(/\/+$/, "")}${path}`;
}

function classify(status: number): "locked" | "unavailable" {
  return status === 402 ? "locked" : "unavailable";
}

export async function fetchCoordinatorReports(
  base: string,
  appUserId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<CoordinatorResult<CoordinatorInbox>> {
  try {
    const res = await fetchImpl(url(base, "/coordinator/reports"), {
      headers: { [APP_USER_HEADER]: appUserId },
    });
    if (!res.ok) return { kind: classify(res.status) };
    const body: unknown = await res.json();
    if (!Array.isArray(body)) return { kind: "unavailable" };
    return { kind: "ok", data: { rows: body as CoordinatorReport[], sample: res.headers.get(SAMPLE_HEADER) === "1" } };
  } catch {
    return { kind: "unavailable" };
  }
}

export async function recordReview(
  base: string,
  appUserId: string,
  review: { proofHash: string; status: ReviewStatus; note?: string },
  fetchImpl: typeof fetch = fetch,
): Promise<CoordinatorResult<CoordinatorReport>> {
  try {
    const res = await fetchImpl(url(base, "/coordinator/review"), {
      method: "POST",
      headers: { "content-type": "application/json", [APP_USER_HEADER]: appUserId },
      body: JSON.stringify({ proofHash: review.proofHash, status: review.status, note: review.note ?? "" }),
    });
    if (!res.ok) return { kind: classify(res.status) };
    const body = (await res.json()) as { review?: CoordinatorReport };
    if (!body.review) return { kind: "unavailable" };
    return { kind: "ok", data: body.review };
  } catch {
    return { kind: "unavailable" };
  }
}

export type JoinOutcome = "joined" | "invalid" | "limited" | "unavailable";

/**
 * Redeem a programme invitation code, so the api treats this subscriber as programme staff and the
 * inbox shows the programme's real reports. Never throws.
 */
export async function joinProgramme(
  base: string,
  appUserId: string,
  code: string,
  fetchImpl: typeof fetch = fetch,
): Promise<JoinOutcome> {
  try {
    const res = await fetchImpl(url(base, "/coordinator/join"), {
      method: "POST",
      headers: { "content-type": "application/json", [APP_USER_HEADER]: appUserId },
      body: JSON.stringify({ code: code.trim() }),
    });
    if (res.ok) return "joined";
    if (res.status === 400 || res.status === 403) return "invalid";
    if (res.status === 429) return "limited";
    return "unavailable";
  } catch {
    return "unavailable";
  }
}

/** Counts per review state, for the summary line above the list. */
export function reviewCounts(rows: CoordinatorReport[]): Record<ReviewStatus, number> {
  const counts: Record<ReviewStatus, number> = { pending: 0, accepted: 0, rejected: 0 };
  for (const r of rows) counts[r.reviewStatus] = (counts[r.reviewStatus] ?? 0) + 1;
  return counts;
}
