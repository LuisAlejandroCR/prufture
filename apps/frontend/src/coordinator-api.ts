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
  attestationCount: number;
  reviewStatus: ReviewStatus;
  reviewNote: string;
  reviewedAt: string;
}

/**
 * `locked`: the server says there is no active plan (402), even if the SDK disagrees.
 * `unavailable`: network, 401/503 or anything unexpected. Never read as "locked".
 */
export type CoordinatorResult<T> =
  | { kind: "ok"; data: T }
  | { kind: "locked" }
  | { kind: "unavailable" };

export const APP_USER_HEADER = "x-app-user-id";

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
): Promise<CoordinatorResult<CoordinatorReport[]>> {
  try {
    const res = await fetchImpl(url(base, "/coordinator/reports"), {
      headers: { [APP_USER_HEADER]: appUserId },
    });
    if (!res.ok) return { kind: classify(res.status) };
    const body: unknown = await res.json();
    if (!Array.isArray(body)) return { kind: "unavailable" };
    return { kind: "ok", data: body as CoordinatorReport[] };
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

export async function fetchCoordinatorCsv(
  base: string,
  appUserId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<CoordinatorResult<string>> {
  try {
    const res = await fetchImpl(url(base, "/coordinator/export.csv"), {
      headers: { [APP_USER_HEADER]: appUserId },
    });
    if (!res.ok) return { kind: classify(res.status) };
    return { kind: "ok", data: await res.text() };
  } catch {
    return { kind: "unavailable" };
  }
}

/** Counts per review state, for the summary line above the list. */
export function reviewCounts(rows: CoordinatorReport[]): Record<ReviewStatus, number> {
  const counts: Record<ReviewStatus, number> = { pending: 0, accepted: 0, rejected: 0 };
  for (const r of rows) counts[r.reviewStatus] = (counts[r.reviewStatus] ?? 0) + 1;
  return counts;
}
