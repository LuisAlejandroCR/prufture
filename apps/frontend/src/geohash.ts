// geohash.ts: minimal geohash encoder. Reduces exact lat/lng to a coarse cell
// so only a ~5-char region prefix is ever stored or signed — never precise coordinates.
// Distinct from keystore.ts (keys) and queue.ts (storage): this is location coarsening only.

const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";

/**
 * Encode a coordinate to a geohash of `precision` chars (default 5 ≈ ±2.4 km cell).
 * Keep precision low on purpose: the goal is a region, not a fix on the volunteer.
 */
export function encodeGeohash(lat: number, lng: number, precision = 5): string {
  let latMin = -90;
  let latMax = 90;
  let lngMin = -180;
  let lngMax = 180;
  let hash = "";
  let bit = 0;
  let ch = 0;
  let even = true;

  while (hash.length < precision) {
    if (even) {
      const mid = (lngMin + lngMax) / 2;
      if (lng >= mid) {
        ch = (ch << 1) | 1;
        lngMin = mid;
      } else {
        ch = ch << 1;
        lngMax = mid;
      }
    } else {
      const mid = (latMin + latMax) / 2;
      if (lat >= mid) {
        ch = (ch << 1) | 1;
        latMin = mid;
      } else {
        ch = ch << 1;
        latMax = mid;
      }
    }
    even = !even;
    if (bit < 4) {
      bit += 1;
    } else {
      hash += BASE32[ch];
      bit = 0;
      ch = 0;
    }
  }
  return hash;
}
