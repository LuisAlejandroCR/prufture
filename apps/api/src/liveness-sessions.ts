// liveness-sessions.ts: single-use bookkeeping for session-flow liveness. POST /liveness/session
// remembers the ids this server opened; POST /liveness/result may claim each one once, so one passed
// face check can never mint a second verified ticket. In memory only: a restart forgets open sessions,
// which fails closed (the device opens a new session). Holds ids and times, nothing about the person.

// Rekognition sessions expire within minutes; this only bounds how long an unclaimed id is kept.
export const SESSION_TTL_MS = 30 * 60 * 1000;
const MAX_OPEN = 10_000;

const open = new Map<string, number>();

function prune(now: number): void {
  for (const [id, at] of open) {
    if (now - at > SESSION_TTL_MS) open.delete(id);
  }
  // Map keeps insertion order, so the oldest ids go first when the cap is hit.
  while (open.size > MAX_OPEN) open.delete(open.keys().next().value!);
}

/** Records a session id this server just opened with the provider. */
export function rememberLivenessSession(id: string, now = Date.now()): void {
  open.delete(id);
  open.set(id, now);
  prune(now);
}

/** True exactly once per remembered, unexpired id; false for unknown, reused or expired ids. */
export function claimLivenessSession(id: string, now = Date.now()): boolean {
  const at = open.get(id);
  open.delete(id);
  return at !== undefined && now - at <= SESSION_TTL_MS;
}

/** Gives a claimed id back after a provider outage, so the device can retry the same session. */
export function releaseLivenessSession(id: string, now = Date.now()): void {
  rememberLivenessSession(id, now);
}

export function resetLivenessSessionsForTests(): void {
  open.clear();
}
