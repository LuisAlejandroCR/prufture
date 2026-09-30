// face-liveness.ts: the one-time live-person face check (EXPO_PUBLIC_LIVENESS_PROVIDER=aws). Opens a
// session on the api, runs the native AWS capture against it, asks the api for the verdict, and keeps
// only the api's signed ticket. Pure (no react-native import); the native capture is injected. Never throws.

import type { FaceLivenessConfig, LivenessProvider } from "./flags";

/** The native capture (modules/prufture-liveness), narrowed so tests can stub it. */
export interface LivenessCapture {
  available(): boolean;
  configure(identityPoolId: string, region: string): Promise<boolean>;
  start(sessionId: string, region: string): Promise<{ status: "completed" } | { status: "failed"; code: string }>;
}

export type UnavailableReason = "off" | "not-configured" | "no-module" | "rate-limited" | "api" | "network";

export type FaceLivenessOutcome =
  /** The api confirmed a live person. `ticket` is its signed receipt: two booleans and a time. */
  | { state: "passed"; ticket: string }
  /** The capture finished but the api did not confirm a live person. Nothing is kept. */
  | { state: "not-confirmed" }
  /** The capture was cancelled, timed out or errored on the device. The api was not asked. */
  | { state: "incomplete" }
  /** The check could not run. Reporting is never blocked by this. */
  | { state: "unavailable"; reason: UnavailableReason };

export interface RunFaceLivenessArgs {
  provider: LivenessProvider;
  config: FaceLivenessConfig | null;
  /** null in Expo Go, on Android, or in a build without the module. */
  capture: LivenessCapture | null;
  apiUrl: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export const REQUEST_TIMEOUT_MS = 15_000;
const MAX_TICKET_LEN = 256;
const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type PostResult = { ok: true; status: number; body: unknown } | { ok: false; status: number } | null;

/** null = no response at all (offline, timeout). Never throws. */
async function post(apiUrl: string, path: string, body: unknown, fetchImpl: typeof fetch, timeoutMs: number): Promise<PostResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${apiUrl.replace(/\/+$/, "")}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) return { ok: false, status: res.status };
    try {
      return { ok: true, status: res.status, body: await res.json() };
    } catch {
      return { ok: true, status: res.status, body: null };
    }
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const unavailable = (reason: UnavailableReason): FaceLivenessOutcome => ({ state: "unavailable", reason });

function failedRequest(r: PostResult): FaceLivenessOutcome {
  if (!r) return unavailable("network");
  return unavailable(r.status === 429 ? "rate-limited" : "api");
}

export async function runFaceLiveness(args: RunFaceLivenessArgs): Promise<FaceLivenessOutcome> {
  const fetchImpl = args.fetchImpl ?? fetch;
  const timeoutMs = args.timeoutMs ?? REQUEST_TIMEOUT_MS;
  if (args.provider !== "aws") return unavailable("off");
  if (!args.config) return unavailable("not-configured");
  const capture = args.capture;
  if (!capture || !capture.available()) return unavailable("no-module");

  // Guest credentials only (no account). A failure here is a build/setup problem, not the person's.
  try {
    if (!(await capture.configure(args.config.identityPoolId, args.config.identityPoolRegion))) {
      return unavailable("not-configured");
    }
  } catch {
    return unavailable("not-configured");
  }

  const opened = await post(args.apiUrl, "/liveness/session", {}, fetchImpl, timeoutMs);
  if (!opened?.ok) return failedRequest(opened);
  const sessionId = (opened.body as { sessionId?: unknown } | null)?.sessionId;
  if (typeof sessionId !== "string" || !SESSION_ID.test(sessionId)) return unavailable("api");

  // "completed" means the capture finished, not that a live person was confirmed.
  try {
    const run = await capture.start(sessionId, args.config.region);
    if (run?.status !== "completed") return { state: "incomplete" };
  } catch {
    return { state: "incomplete" };
  }

  const result = await post(args.apiUrl, "/liveness/result", { sessionId }, fetchImpl, timeoutMs);
  if (!result?.ok) return failedRequest(result);
  const data = (result.body ?? {}) as { verifiedPerson?: unknown; degraded?: unknown; ticket?: unknown };
  if (data.degraded === true) return unavailable("api");
  if (data.verifiedPerson !== true) return { state: "not-confirmed" };
  const ticket = typeof data.ticket === "string" && data.ticket.length <= MAX_TICKET_LEN ? data.ticket : "";
  const claims = ticketClaims(ticket);
  // A pass without a ticket that itself says "passed" is nothing the api would accept later.
  if (!claims || !claims.verifiedPerson || claims.degraded) return unavailable("api");
  return { state: "passed", ticket };
}

// ---- The device's liveness pass ------------------------------------------------------------------

/** Mirrors the api's TICKET_TTL_MS (apps/api/src/liveness-ticket.ts). */
export const TICKET_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** A report can wait offline before its attach reaches the api; stop using a ticket this early. */
export const TICKET_MARGIN_MS = 2 * 24 * 60 * 60 * 1000;

export interface TicketClaims {
  verifiedPerson: boolean;
  degraded: boolean;
  issuedAt: number;
}

function base64UrlToString(s: string): string {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  return decodeURIComponent(
    Array.from(globalThis.atob(b64), (ch) => `%${ch.charCodeAt(0).toString(16).padStart(2, "0")}`).join(""),
  );
}

/**
 * What a ticket says about itself, for this device's own screens. NOT a verification: only the api
 * can check the MAC, and it re-checks every ticket it is handed. null for anything malformed.
 */
export function ticketClaims(ticket: unknown): TicketClaims | null {
  if (typeof ticket !== "string" || ticket.length > MAX_TICKET_LEN) return null;
  const parts = ticket.split(".");
  if (parts.length !== 3 || parts[0] !== "v1" || !parts[1] || !parts[2]) return null;
  try {
    const c = JSON.parse(base64UrlToString(parts[1])) as { p?: unknown; d?: unknown; t?: unknown };
    if (typeof c.p !== "boolean" || typeof c.d !== "boolean" || typeof c.t !== "number" || !Number.isFinite(c.t)) return null;
    return { verifiedPerson: c.p, degraded: c.d, issuedAt: c.t };
  } catch {
    return null;
  }
}

/** When this device stops attaching the ticket; null when it is not a usable pass at all. */
export function passUsableUntil(ticket: unknown): number | null {
  const c = ticketClaims(ticket);
  if (!c || !c.verifiedPerson || c.degraded) return null;
  return c.issuedAt + TICKET_TTL_MS - TICKET_MARGIN_MS;
}

interface KeyValueStore {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string, options?: { keychainAccessible?: number }): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

const PASS_KEY = "prufture.liveness.pass";
let injected: KeyValueStore | null = null;

/** Test seam: swap the store. Pass null to restore expo-secure-store. */
export function __setLivenessPassStore(store: KeyValueStore | null): void {
  injected = store;
}

async function passStore(): Promise<{ store: KeyValueStore; thisDeviceOnly?: number } | null> {
  if (injected) return { store: injected };
  try {
    const SecureStore = await import("expo-secure-store");
    return { store: SecureStore, thisDeviceOnly: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
  } catch {
    return null;
  }
}

/** Keeps a passed ticket on this device only (never in a backup). Anything else is ignored. */
export async function saveLivenessPass(ticket: string): Promise<boolean> {
  if (passUsableUntil(ticket) === null) return false;
  try {
    const s = await passStore();
    if (!s) return false;
    await s.store.setItemAsync(PASS_KEY, ticket, { keychainAccessible: s.thisDeviceOnly });
    return true;
  } catch {
    return false;
  }
}

/** The stored pass while it is still usable; an expired or malformed one is removed. */
export async function loadLivenessPass(now = Date.now()): Promise<{ ticket: string; usableUntil: number } | null> {
  try {
    const s = await passStore();
    const ticket = s ? await s.store.getItemAsync(PASS_KEY) : null;
    if (!ticket) return null;
    const until = passUsableUntil(ticket);
    if (until === null || until <= now) {
      await s!.store.deleteItemAsync(PASS_KEY);
      return null;
    }
    return { ticket, usableUntil: until };
  } catch {
    return null;
  }
}

export async function clearLivenessPass(): Promise<void> {
  try {
    const s = await passStore();
    await s?.store.deleteItemAsync(PASS_KEY);
  } catch {
    // Non-fatal: an unreadable pass is never attached anyway.
  }
}

// ---- Screen copy ---------------------------------------------------------------------------------

export interface OutcomeCopy {
  title: string;
  body: string;
  tone: "success" | "warning" | "info";
  /** Offer "Try again": only where another attempt can plausibly succeed soon. */
  retry: boolean;
}

/** "5 November": the last day this phone attaches the pass. */
export function passUntilLabel(until: number): string {
  return new Date(until).toLocaleDateString("en-GB", { day: "numeric", month: "long" });
}

/** What the face-check screen says for each outcome. Every path ends with reporting still open. */
export function outcomeCopy(outcome: FaceLivenessOutcome, now = Date.now()): OutcomeCopy {
  switch (outcome.state) {
    case "passed": {
      const until = passUsableUntil(outcome.ticket) ?? now;
      return {
        title: "Live person confirmed",
        body: `Reports you send from this phone until ${passUntilLabel(until)} will show "verified person: yes". No image of your face was kept.`,
        tone: "success",
        retry: false,
      };
    }
    case "not-confirmed":
      return {
        title: "Could not confirm a live person",
        body: "Nothing was kept. You can try again in good light, or keep reporting as usual.",
        tone: "warning",
        retry: true,
      };
    case "incomplete":
      return {
        title: "The check did not finish",
        body: "Nothing was kept. You can try again, or keep reporting as usual.",
        tone: "warning",
        retry: true,
      };
    case "unavailable":
      switch (outcome.reason) {
        case "rate-limited":
          return { title: "The face check is busy", body: "Too many checks right now. Try again later. Reporting works as usual.", tone: "info", retry: false };
        case "network":
          return { title: "No connection", body: "The face check needs a connection. Reporting still works offline.", tone: "info", retry: true };
        case "no-module":
          return { title: "Not available on this phone", body: "This version of the app cannot run the face check. Reporting works as usual.", tone: "info", retry: false };
        default:
          return { title: "Face check unavailable", body: "The check cannot run right now. Reporting works as usual.", tone: "info", retry: false };
      }
  }
}
