// geohash.ts: base-32 geohash DECODE only (algorithm copied from apps/frontend/src/geohash.ts, not
// imported across apps). Turns a 1-5 char coarse cell into its bounding box / centre for the coverage
// map; never encodes and never sees a precise point.

const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";

export interface GeohashBounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

/**
 * Decode a geohash to the bounding box of its cell. Accepts 1-5 chars (longer input is
 * still decoded but callers only ever pass a <=5 char region). Returns null for an
 * empty or invalid string so callers can skip the cell.
 */
export function decodeGeohashBounds(hash: string): GeohashBounds | null {
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
  return { minLat, maxLat, minLng, maxLng };
}

export interface LatLng {
  lat: number;
  lng: number;
}

/** Centre point of a geohash cell. Null for an empty or invalid string. */
export function geohashCenter(hash: string): LatLng | null {
  const b = decodeGeohashBounds(hash);
  if (!b) return null;
  return { lat: (b.minLat + b.maxLat) / 2, lng: (b.minLng + b.maxLng) / 2 };
}
