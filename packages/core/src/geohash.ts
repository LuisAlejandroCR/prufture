// geohash.ts: the one place that defines how coarse a location may be before it is signed.
// The signed payload is what reaches the chain, so coarsening has to happen BEFORE signPayload,
// not on the way out. Distinct from apps/frontend/src/geohash.ts (lat/lng -> cell encoder) and
// apps/backend/lib/geohash.ts (cell -> bounding box): this module only trims and validates.

/** Geohash chars allowed to be signed or published. 5 chars is a ~5 km cell, never a fix. */
export const COARSE_GEOHASH_LEN = 5;

const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";

/**
 * Trim a geohash to the coarse cell. Lowercases first, because base-32 geohash is
 * case-insensitive and a mixed-case string would otherwise produce two spellings of one cell.
 */
export function coarsenGeohash(hash: string, len: number = COARSE_GEOHASH_LEN): string {
  return hash.toLowerCase().slice(0, len);
}

/**
 * True when `hash` is a non-empty, well-formed geohash of at most COARSE_GEOHASH_LEN chars.
 * The api uses this as a trust boundary: a client that signs a finer cell is rejected rather
 * than silently truncated, because truncating would invalidate the signature it just sent.
 */
export function isCoarseGeohash(hash: string): boolean {
  if (typeof hash !== "string") return false;
  if (hash.length === 0 || hash.length > COARSE_GEOHASH_LEN) return false;
  for (const c of hash) {
    if (!BASE32.includes(c)) return false;
  }
  return true;
}
