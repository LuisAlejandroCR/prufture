// confirmations.ts: community-confirmation count for the public /verify/[hash] page. Reads the api's
// GET /proof/:hash/confirmations rows and counts reports that carry a verified programme pass and sit
// within 5 km of this one. The pass is spent once per member per task and epoch, so two such reports
// are two different enrolled members; reports without a pass never count. The same rows give each
// photo its report's pass and face check (reportChecks). Pure.

import { geohashCenter } from "./geohash";

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
}

/** A report counts only from within this distance of this report's area (same as the app). */
export const NEARBY_KM = 5;

export type Stage = "received" | "waiting" | "confirmed";

const EARTH_KM = 6371;

/** Great-circle distance between two geohash cell centres. null if either is not a geohash. */
export function regionDistanceKm(a: string, b: string): number | null {
  const p = geohashCenter(a);
  const q = geohashCenter(b);
  if (!p || !q) return null;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(q.lat - p.lat);
  const dLng = rad(q.lng - p.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(p.lat)) * Math.cos(rad(q.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Pass-confirmed reports near `ownRegion`, this report included when it carries a pass. A report
 * without a pass, or with an unreadable region, never counts.
 */
export function nearbyReportCount(ownRegion: string, reports: ConfirmationReport[]): number {
  let n = 0;
  for (const r of reports) {
    if (!r.membershipVerified) continue;
    if (r.own) {
      n += 1;
      continue;
    }
    const d = regionDistanceKm(ownRegion, r.geohashRegion);
    if (d !== null && d < NEARBY_KM) n += 1;
  }
  return n;
}

/**
 * Confirmed needs two pass-confirmed reports nearby. Without that (or when the confirmations
 * route is unavailable, `nearby === null`) the stage falls back to whether the report is anchored.
 */
export function stageFor(nearby: number | null, attestationCount: number): Stage {
  if (nearby !== null && nearby >= 2) return "confirmed";
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
      } => !!r && typeof r === "object" && typeof r.own === "boolean" && typeof r.geohashRegion === "string",
    )
    .map((r) => ({
      own: r.own,
      geohashRegion: r.geohashRegion,
      membershipVerified: r.membershipVerified === true,
      verifiedPerson: typeof r.verifiedPerson === "boolean" ? r.verifiedPerson : null,
      verifiedPersonDegraded: typeof r.verifiedPersonDegraded === "boolean" ? r.verifiedPersonDegraded : null,
    }));
}
