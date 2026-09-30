// liveness-rate-limit.ts: spend guard for POST /liveness/session. Every call opens a PAID provider
// session and the route is unauthenticated, so it passes a per-IP token bucket and a global daily
// cap (LIVENESS_SESSION_DAILY_CAP). In memory; holds IP keys and counters only, never persisted.

// A reporter checks liveness once, at enrolment, with a few retries. Volunteers enrolling together
// on one venue Wi-Fi or behind carrier NAT share an IP, so the burst leaves room for a small group.
export const BUCKET_CAPACITY = 10;
export const REFILL_MS = 6 * 60 * 1000; // one session per 6 minutes per IP once the burst is spent
export const DEFAULT_DAILY_CAP = 200;
const MAX_BUCKETS = 10_000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** LIVENESS_SESSION_DAILY_CAP: sessions per UTC day across all callers. Junk or unset -> 200; 0 closes the route. */
export function dailyCap(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.LIVENESS_SESSION_DAILY_CAP?.trim();
  if (!raw) return DEFAULT_DAILY_CAP;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n >= 0 ? n : DEFAULT_DAILY_CAP;
}

/** TRUSTED_PROXY_HOPS: proxies that append to X-Forwarded-For in front of the api. Junk or unset -> 1. */
export function trustedProxyHops(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number(env.TRUSTED_PROXY_HOPS?.trim() || "1");
  return Number.isSafeInteger(n) && n >= 1 && n <= 5 ? n : 1;
}

/**
 * The caller's IP as seen by the outermost trusted proxy. Entries left of it are client-supplied
 * and spoofable, so the key is counted from the right. No header (local dev, tests) -> one shared key.
 */
export function clientKey(forwardedFor: string | undefined, hops = trustedProxyHops()): string {
  const parts = (forwardedFor ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return "unknown";
  return parts[Math.max(0, parts.length - hops)]!.slice(0, 64);
}

interface Bucket {
  tokens: number;
  at: number;
}

const buckets = new Map<string, Bucket>();
let day = -1;
let usedToday = 0;

function refilled(b: Bucket, now: number): number {
  return Math.min(BUCKET_CAPACITY, b.tokens + Math.max(0, now - b.at) / REFILL_MS);
}

function prune(now: number): void {
  if (buckets.size <= MAX_BUCKETS) return;
  // A full bucket behaves exactly like a missing one, so those go first; then the oldest.
  for (const [k, b] of buckets) if (refilled(b, now) >= BUCKET_CAPACITY) buckets.delete(k);
  while (buckets.size > MAX_BUCKETS) buckets.delete(buckets.keys().next().value!);
}

export type SessionSlot = { ok: true } | { ok: false; reason: "ip" | "daily"; retryAfterSec: number };

/** Takes one session slot for this caller, or says which limit refused it. A refusal consumes nothing. */
export function takeLivenessSessionSlot(key: string, now = Date.now(), env: NodeJS.ProcessEnv = process.env): SessionSlot {
  const today = Math.floor(now / DAY_MS);
  if (today !== day) {
    day = today;
    usedToday = 0;
  }

  const b = buckets.get(key);
  const tokens = b ? refilled(b, now) : BUCKET_CAPACITY;
  if (tokens < 1) {
    return { ok: false, reason: "ip", retryAfterSec: Math.ceil(((1 - tokens) * REFILL_MS) / 1000) };
  }
  if (usedToday >= dailyCap(env)) {
    return { ok: false, reason: "daily", retryAfterSec: Math.ceil(((today + 1) * DAY_MS - now) / 1000) };
  }

  usedToday += 1;
  buckets.delete(key); // re-insert so Map order stays oldest-first for prune()
  buckets.set(key, { tokens: tokens - 1, at: now });
  prune(now);
  return { ok: true };
}

export function resetLivenessRateLimitForTests(): void {
  buckets.clear();
  day = -1;
  usedToday = 0;
}
