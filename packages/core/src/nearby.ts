// nearby.ts: the community-confirmation rule, shared by the api (the dashboard's "Confirmed") and the
// web's public /verify page so the two can never disagree. A report counts when it carries a verified
// programme pass and its coarse cell centre is within NEARBY_KM of the report being judged; two such
// reports confirm it. The pass is spent once per member per task and epoch, so two counted reports are
// two different enrolled members — within one round. A new round (epoch) lets every member prove
// once more per task, so a pass from round 1 and a pass from round 2 may be the same person: only
// passes of the same round count together. Pure: geohash decode and a great-circle distance.

/** A report counts only from within this distance of the judged report's area (same as the app). */
export const NEARBY_KM = 5;

/** Pass-carrying reports nearby (the judged one included) needed to call a report confirmed. */
export const CONFIRMED_MIN_REPORTS = 2;

const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";
const EARTH_KM = 6371;

/** Centre of a geohash cell. null for an empty or invalid string. */
export function geohashCellCenter(hash: string): { lat: number; lng: number } | null {
  if (!hash) return null;
  let minLat = -90;
  let maxLat = 90;
  let minLng = -180;
  let maxLng = 180;
  let even = true;
  for (const c of hash.toLowerCase()) {
    const idx = BASE32.indexOf(c);
    if (idx < 0) return null;
    for (let bit = 4; bit >= 0; bit -= 1) {
      const on = (idx >> bit) & 1;
      if (even) {
        const mid = (minLng + maxLng) / 2;
        if (on) minLng = mid;
        else maxLng = mid;
      } else {
        const mid = (minLat + maxLat) / 2;
        if (on) minLat = mid;
        else maxLat = mid;
      }
      even = !even;
    }
  }
  return { lat: (minLat + maxLat) / 2, lng: (minLng + maxLng) / 2 };
}

/** Great-circle distance between two geohash cell centres. null if either is not a geohash. */
export function cellDistanceKm(a: string, b: string): number | null {
  const p = geohashCellCenter(a);
  const q = geohashCellCenter(b);
  if (!p || !q) return null;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(q.lat - p.lat);
  const dLng = rad(q.lng - p.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(p.lat)) * Math.cos(rad(q.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** The fields of one independent report of a task that the rule reads. */
export interface PassReport {
  /** True for the report being judged. */
  own: boolean;
  geohashRegion: string;
  membershipVerified: boolean;
  /** Round (epoch) the pass was proven in. Missing reads as round 0 (passes before rounds were kept). */
  round?: number;
}

const roundOf = (r: PassReport) => (typeof r.round === "number" && Number.isFinite(r.round) ? r.round : 0);

/** Pass-carrying reports of one round near `ownRegion`, the judged report included when it is one. */
function countInRound(ownRegion: string, reports: readonly PassReport[], round: number): number {
  let n = 0;
  for (const r of reports) {
    if (!r.membershipVerified || roundOf(r) !== round) continue;
    if (r.own) {
      n += 1;
      continue;
    }
    const d = cellDistanceKm(ownRegion, r.geohashRegion);
    if (d !== null && d < NEARBY_KM) n += 1;
  }
  return n;
}

/**
 * Pass-carrying reports near `ownRegion`, the judged report included when it carries a pass. Only
 * one round counts: the judged report's own round when it carries a pass, else the round with the
 * most. A report without a pass, or with an unreadable region, never counts.
 */
export function nearbyPassReportCount(ownRegion: string, reports: readonly PassReport[]): number {
  const own = reports.find((r) => r.own && r.membershipVerified);
  if (own) return countInRound(ownRegion, reports, roundOf(own));
  const rounds = new Set(reports.filter((r) => r.membershipVerified).map(roundOf));
  let best = 0;
  for (const round of rounds) best = Math.max(best, countInRound(ownRegion, reports, round));
  return best;
}

/** True when enough pass-carrying reports nearby agree. */
export function isCommunityConfirmed(ownRegion: string, reports: readonly PassReport[]): boolean {
  return nearbyPassReportCount(ownRegion, reports) >= CONFIRMED_MIN_REPORTS;
}
