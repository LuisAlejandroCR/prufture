// coordinator-join.ts: a coordinator joins the programme's staff from the app with an invitation code
// (COORDINATOR_INVITE_CODES), so adding one no longer means editing PROGRAMME_STAFF_APP_USER_IDS and
// redeploying. The store keeps the hash of the code each id used, never the code, and a join counts
// only while that code is still configured: retiring a code removes everyone who joined with it.
// Wrong codes are rate limited per caller, on top of the paid plan every caller already needs.

import { createHash, timingSafeEqual } from "node:crypto";
import { env } from "./env.js";
import { getStaffJoin, putStaffJoin } from "./store.js";

/** Codes shorter than this are ignored: a short code is guessable. */
export const MIN_CODE_LENGTH = 8;
/** Longer bodies are malformed, not a code. */
export const MAX_CODE_LENGTH = 64;
/** Wrong codes allowed per caller per window before even the right one waits. */
export const MAX_JOIN_FAILURES = 5;
export const JOIN_WINDOW_MS = 60 * 60 * 1000;

const normalize = (code: string) => code.trim().toUpperCase();
const codeHash = (code: string) => createHash("sha256").update(`prufture-coordinator-invite|${normalize(code)}`).digest("hex");

function activeHashes(): string[] {
  return env.coordinatorInviteCodes.map(normalize).filter((c) => c.length >= MIN_CODE_LENGTH).map(codeHash);
}

function sameHex(a: string, b: string): boolean {
  const x = Buffer.from(a, "hex");
  const y = Buffer.from(b, "hex");
  return x.length === y.length && timingSafeEqual(x, y);
}

/** True when this id joined with a code that is still configured. */
export function isJoinedStaff(appUserId: string): boolean {
  const joined = getStaffJoin(appUserId);
  if (!joined) return false;
  let ok = false;
  for (const h of activeHashes()) if (sameHex(h, joined)) ok = true;
  return ok;
}

export function isCodeShaped(code: unknown): code is string {
  return typeof code === "string" && code.trim().length > 0 && code.length <= MAX_CODE_LENGTH;
}

const failures = new Map<string, { count: number; since: number }>();

export type JoinOutcome = "joined" | "invalid" | "limited";

/** Redeem `code` for `appUserId`. Never throws. */
export function tryJoin(appUserId: string, code: string, now = Date.now()): JoinOutcome {
  const f = failures.get(appUserId);
  if (f && now - f.since > JOIN_WINDOW_MS) failures.delete(appUserId);
  const current = failures.get(appUserId);
  if (current && current.count >= MAX_JOIN_FAILURES) return "limited";

  const given = codeHash(code);
  let match: string | null = null;
  if (normalize(code).length >= MIN_CODE_LENGTH) {
    for (const h of activeHashes()) if (sameHex(h, given)) match = h;
  }
  if (!match) {
    failures.set(appUserId, current ? { ...current, count: current.count + 1 } : { count: 1, since: now });
    return "invalid";
  }
  failures.delete(appUserId);
  putStaffJoin(appUserId, match);
  return "joined";
}

/** Test-only: forget every failed attempt. */
export function __resetJoinAttempts(): void {
  failures.clear();
}
