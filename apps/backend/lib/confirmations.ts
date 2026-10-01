// confirmations.ts: community-confirmation count for the public /verify/[hash] page. Reads the api's
// GET /proof/:hash/confirmations rows and counts reports that carry a verified programme pass and sit
// within 5 km of this one. The pass is spent once per member per task and epoch, so two such reports
// are two different enrolled members; reports without a pass never count. The same rows give each
// photo its report's pass and face check (reportChecks). Pure.

import { CONFIRMED_MIN_REPORTS, cellDistanceKm, nearbyPassReportCount } from "@proof/core";

/** One independent field report for the same task, as the api returns it. */
export interface ConfirmationReport {
  own: boolean;
  geohashRegion: string;
  /** Verified programme pass. Missing from an older api reads as false, never as confirmed. */
  membershipVerified: boolean;
  /** Face check for the whole report: true if any photo passed. null when none was attached. */
  verifiedPerson: boolean | null;
  /** For a false verdict: true when the provider was down, not a failed check. */
  verifiedPersonDegraded: boolean | null;
  /** Round (epoch) of the pass. Passes of different rounds never confirm each other. Missing: round 0. */
  round?: number;
}

// The rule itself lives in @proof/core, shared with the api's dashboard status, so /verify and the
// dashboard can never disagree on what "Confirmed" means.
export { NEARBY_KM } from "@proof/core";
export type Stage = "received" | "waiting" | "confirmed";

/** Great-circle distance between two geohash cell centres. null if either is not a geohash. */
export const regionDistanceKm = cellDistanceKm;

/**
 * Pass-confirmed reports near `ownRegion`, this report included when it carries a pass. A report
 * without a pass, or with an unreadable region, never counts.
 */
export const nearbyReportCount: (ownRegion: string, reports: ConfirmationReport[]) => number = nearbyPassReportCount;

/**
 * Confirmed needs two pass-confirmed reports nearby. Without that (or when the confirmations
 * route is unavailable, `nearby === null`) the stage falls back to whether the report is anchored.
 */
export function stageFor(nearby: number | null, attestationCount: number): Stage {
  if (nearby !== null && nearby >= CONFIRMED_MIN_REPORTS) return "confirmed";
  return attestationCount >= 1 ? "waiting" : "received";
}

/** The programme pass and face check fields of one photo's record (GET /proof/:hash). */
export interface ReportChecks {
  membership: "verified" | null;
  verifiedPerson: boolean | null;
  verifiedPersonDegraded: boolean | null;
}

/**
 * The pass and face check to show for a photo: its report's (the `own` row), since a report proves
 * the pass on one photo and older builds attached the face check to the first photo only. Without
 * that row, or when the report has no face check verdict, the photo's own fields stand. Another
 * report's row never lends its pass or face check to this one.
 */
export function reportChecks(photo: ReportChecks, reports: ConfirmationReport[] | null): ReportChecks {
  const own = reports?.find((r) => r.own);
  const membership = photo.membership === "verified" || own?.membershipVerified ? "verified" : null;
  if (own && own.verifiedPerson !== null) {
    return { membership, verifiedPerson: own.verifiedPerson, verifiedPersonDegraded: own.verifiedPersonDegraded };
  }
  return { membership, verifiedPerson: photo.verifiedPerson, verifiedPersonDegraded: photo.verifiedPersonDegraded };
}

/** Validate the api body. Malformed rows are dropped; a malformed body is null. */
export function parseConfirmations(body: unknown): ConfirmationReport[] | null {
  if (!body || typeof body !== "object") return null;
  const list = (body as { reports?: unknown }).reports;
  if (!Array.isArray(list)) return null;
  return list
    .filter(
      (
        r,
      ): r is {
        own: boolean;
        geohashRegion: string;
        membershipVerified?: unknown;
        verifiedPerson?: unknown;
        verifiedPersonDegraded?: unknown;
        round?: unknown;
      } => !!r && typeof r === "object" && typeof r.own === "boolean" && typeof r.geohashRegion === "string",
    )
    .map((r) => ({
      own: r.own,
      geohashRegion: r.geohashRegion,
      membershipVerified: r.membershipVerified === true,
      verifiedPerson: typeof r.verifiedPerson === "boolean" ? r.verifiedPerson : null,
      verifiedPersonDegraded: typeof r.verifiedPersonDegraded === "boolean" ? r.verifiedPersonDegraded : null,
      ...(typeof r.round === "number" && Number.isSafeInteger(r.round) && r.round >= 0 ? { round: r.round } : {}),
    }));
}
