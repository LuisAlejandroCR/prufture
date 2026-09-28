// liveness-ticket.ts: a server-signed (HMAC) receipt for a liveness verdict. POST /liveness-result
// is unauthenticated and proof hashes are public, so it records only what a valid ticket from
// /verify-identity says, never a body verdict. Carries two booleans and a time — no frame or identity.

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export interface TicketVerdict {
  verifiedPerson: boolean;
  degraded: boolean;
}

// Offline-first: a report can sit on the device for days before it syncs and attaches the
// verdict, so the ticket outlives a session. Past this age it is refused.
export const TICKET_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_TICKET_LEN = 256;
const VERSION = "v1";

// A configured secret keeps tickets valid across restarts and replicas. Without one, a random
// per-process secret still makes tickets unforgeable; a restart only invalidates those not yet
// attached, which leaves verifiedPerson null — the same outcome as a missed attach.
const processSecret = randomBytes(32);
function secret(): Buffer {
  const configured = process.env.LIVENESS_TICKET_SECRET ?? "";
  return configured.length >= 32 ? Buffer.from(configured, "utf8") : processSecret;
}

function mac(body: string): string {
  return createHmac("sha256", secret()).update(`${VERSION}.${body}`).digest("base64url");
}

export function issueTicket(v: TicketVerdict, now = Date.now()): string {
  const body = Buffer.from(
    JSON.stringify({ p: v.verifiedPerson === true, d: v.degraded === true, t: now }),
  ).toString("base64url");
  return `${VERSION}.${body}.${mac(body)}`;
}

/** The verdict a ticket vouches for, or null for anything forged, malformed or expired. */
export function readTicket(ticket: unknown, now = Date.now()): TicketVerdict | null {
  if (typeof ticket !== "string" || ticket.length > MAX_TICKET_LEN) return null;
  const parts = ticket.split(".");
  if (parts.length !== 3 || parts[0] !== VERSION) return null;
  const [, body, sig] = parts as [string, string, string];

  const expected = Buffer.from(mac(body));
  const given = Buffer.from(sig);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

  try {
    const claims = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { p?: unknown; d?: unknown; t?: unknown };
    if (typeof claims.p !== "boolean" || typeof claims.d !== "boolean" || typeof claims.t !== "number") return null;
    if (claims.t > now + 60_000 || now - claims.t > TICKET_TTL_MS) return null;
    return { verifiedPerson: claims.p, degraded: claims.d };
  } catch {
    return null;
  }
}
