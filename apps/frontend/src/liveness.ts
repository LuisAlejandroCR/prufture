// liveness.ts: runs a short selfie liveness challenge and sends it once to the api (POST
// /verify-identity). Nothing is signed or committed; frames + nonce leave the device exactly once and
// are never stored — the api turns them into one verifiedPerson boolean against the proofHash.

export type Gesture = "center" | "left" | "right" | "blink";

export interface Challenge {
  /** 16 random bytes, hex. Ties the frames to this one attempt; never persisted. */
  nonceHex: string;
  /** Three gestures, order chosen from the global CSPRNG shim. */
  sequence: Gesture[];
}

export interface LivenessResult {
  frames: string[];
  nonceHex: string;
  sequence: Gesture[];
}

export interface LivenessVerdict {
  verifiedPerson: boolean;
  degraded: boolean;
  /**
   * The api's signed receipt for this verdict: two booleans, an issue time and a MAC — no frame,
   * nonce or identity. /liveness-result records only what a ticket says, so without one there is
   * nothing to attach. "" when the api could not be reached.
   */
  ticket: string;
}

const MAX_TICKET_LEN = 256;

const GESTURES: Gesture[] = ["center", "left", "right", "blink"];
const STEPS = 3;

function randomBytesHex(n: number): string {
  const buf = new Uint8Array(n);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Pick `STEPS` gestures (with repeats allowed) using the CSPRNG shim. */
export function newChallenge(): Challenge {
  const pick = new Uint8Array(STEPS);
  crypto.getRandomValues(pick);
  const sequence = Array.from(pick, (n) => GESTURES[n % GESTURES.length]!);
  return { nonceHex: randomBytesHex(16), sequence };
}

export interface RunLivenessArgs {
  /** Grab one small base64 JPEG frame (quality ~0.3). Called once per step. */
  takeFrame: () => Promise<string | null>;
  /** Progress callback: which gesture is being asked for, and its index. */
  onStep?: (gesture: Gesture, index: number, total: number) => void;
}

/** Walk the sequence, collecting one frame per completed gesture. */
export async function runLiveness(args: RunLivenessArgs): Promise<LivenessResult> {
  const { nonceHex, sequence } = newChallenge();
  const frames: string[] = [];
  for (let i = 0; i < sequence.length; i += 1) {
    args.onStep?.(sequence[i]!, i, sequence.length);
    const frame = await args.takeFrame();
    if (frame) frames.push(frame);
  }
  return { frames, nonceHex, sequence };
}

async function post(
  apiUrl: string,
  path: string,
  body: unknown,
  fetchImpl: typeof fetch = fetch,
): Promise<Response | null> {
  try {
    return await fetchImpl(`${apiUrl.replace(/\/+$/, "")}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return null;
  }
}

/**
 * Send the frames once. Guard-style: never throws. Any failure (offline, provider
 * down, unconfigured api) resolves to { verifiedPerson: false, degraded: true } so
 * the reporter is never blocked.
 */
export async function submitLiveness(
  apiUrl: string,
  input: LivenessResult,
  fetchImpl: typeof fetch = fetch,
): Promise<LivenessVerdict> {
  const res = await post(
    apiUrl,
    "/verify-identity",
    { frames: input.frames, nonceHex: input.nonceHex, challenges: input.sequence },
    fetchImpl,
  );
  if (!res || !res.ok) return { verifiedPerson: false, degraded: true, ticket: "" };
  try {
    const data = (await res.json()) as { verifiedPerson?: unknown; degraded?: unknown; ticket?: unknown };
    return {
      verifiedPerson: data.verifiedPerson === true,
      degraded: data.degraded === true,
      ticket: typeof data.ticket === "string" && data.ticket.length <= MAX_TICKET_LEN ? data.ticket : "",
    };
  } catch {
    return { verifiedPerson: false, degraded: true, ticket: "" };
  }
}

// Attach the verdict to a proof, with an offline retry buffer.

interface PendingAttach {
  proofHash: string;
  ticket: string;
}

/** In-memory only. A missed attach just leaves verifiedPerson null on /verify — acceptable. */
const pending: PendingAttach[] = [];

async function tryAttach(
  apiUrl: string,
  item: PendingAttach,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  const res = await post(apiUrl, "/liveness-result", item, fetchImpl);
  if (!res) return false; // offline: keep it pending
  // 404 = proof not on the api yet; keep it pending for the next sync pass. A 400 (ticket
  // refused, e.g. expired) or 409 (a verdict is already recorded) will never succeed on retry.
  return res.ok || res.status === 400 || res.status === 409;
}

/**
 * Attach the verdict a ticket vouches for to `proofHash`. Fire-and-forget: on any failure the
 * item is buffered and retried by flushPendingLiveness() on the next sync pass. Without a
 * ticket there is nothing the api would accept, so nothing is sent.
 */
export async function attachLiveness(
  apiUrl: string,
  proofHash: string,
  ticket: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  if (!ticket) return;
  const item = { proofHash, ticket };
  const done = await tryAttach(apiUrl, item, fetchImpl);
  if (!done && !pending.some((p) => p.proofHash === proofHash)) pending.push(item);
}

/** Retry every buffered attach. Called from the sync pass. Never throws. */
export async function flushPendingLiveness(
  apiUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  for (let i = pending.length - 1; i >= 0; i -= 1) {
    const ok = await tryAttach(apiUrl, pending[i]!, fetchImpl).catch(() => false);
    if (ok) pending.splice(i, 1);
  }
}

/** Test-only: inspect / reset the retry buffer. */
export function __pendingLiveness(): PendingAttach[] {
  return [...pending];
}
export function __resetPendingLiveness(): void {
  pending.length = 0;
}
