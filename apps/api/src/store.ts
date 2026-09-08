// store.ts: durable attestation index keyed by proofHash, persisted as one JSON file.
// Holds only the zero-PII public payload, attestation records, and a boolean verified attribute.
// File-backed (node:fs, atomic rename) so proofs survive an api restart. Same exported API as the
// old in-memory Map — no caller change. Swap the file backend for hosted KV/SQLite if the api ever
// runs on ephemeral storage: see SWAP POINT below.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import type { ProofPublicPayload } from "@proof/core";

export interface AttestationRecord {
  attester: string;
  txHash: string;
  attestedAt: string;
}

/** A verified attribute recorded against a proof. Boolean only — zero PII by construction. */
export interface VerifiedAttributeRecord {
  attribute: string;
  value: boolean;
  checkedAt: string;
}

export interface Entry {
  payload: ProofPublicPayload;
  attestations: AttestationRecord[];
  verifiedAttribute?: VerifiedAttributeRecord;
  /** Selfie liveness verdict. Boolean only, set by /liveness-result. Separate from verifiedAttribute. */
  verifiedPerson?: boolean;
  /**
   * Encrypted precise-location point, sealed on the device to the programme team's key.
   * Opaque hex — this process never decrypts or parses it, and it is NEVER returned by
   * any public route (see docs/location_privacy.md).
   */
  preciseLocationCipher?: string;
  // Groups 1..N signed proofs of one field report. NOT part of the signed payload and never
  // exposed on a public route — used only to send ONE programme notification per report.
  reportId?: string;
}

// Reserved top-level JSON key (never a 64-hex proofHash) holding the dedup keys already
// notified to the programme team, so one report is never messaged twice across a restart.
const NOTIFIED_KEYS_FIELD = "__notifiedKeys__";

// SWAP POINT: a JSON file needs a host with a persistent writable disk (Render disk, Railway or
// Fly volume) — NOT Vercel serverless. If apps/api is deployed somewhere ephemeral, replace only
// load() and flushNow() with a hosted KV or SQLite client (Turso, Upstash Redis) behind these same
// exported functions; no caller and no test outside this file needs to change.
const FLUSH_DEBOUNCE_MS = 50;

function defaultStorePath(): string {
  if (process.env.STORE_PATH) return process.env.STORE_PATH;
  // Under `node --test` each file runs in its own process; keep the repo tree clean.
  if (process.env.NODE_TEST_CONTEXT) return join(tmpdir(), `prufture-store-test-${process.pid}.json`);
  return "./.data/store.json";
}

let storePath = defaultStorePath();
const byHash = new Map<string, Entry>();
const notifiedKeys = new Set<string>();
let flushTimer: NodeJS.Timeout | null = null;

function load(): void {
  byHash.clear();
  notifiedKeys.clear();
  let raw: string;
  try {
    raw = readFileSync(storePath, "utf8");
  } catch {
    return; // absent file -> start empty
  }
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    if (obj && typeof obj === "object") {
      for (const [hash, value] of Object.entries(obj)) {
        if (hash === NOTIFIED_KEYS_FIELD) {
          if (Array.isArray(value)) for (const k of value) if (typeof k === "string") notifiedKeys.add(k);
          continue;
        }
        const v = value as Entry;
        if (v && typeof v === "object" && v.payload && typeof v.payload === "object") {
          byHash.set(hash, {
            payload: v.payload,
            attestations: Array.isArray(v.attestations) ? v.attestations : [],
            verifiedAttribute: v.verifiedAttribute,
            verifiedPerson: typeof v.verifiedPerson === "boolean" ? v.verifiedPerson : undefined,
            preciseLocationCipher:
              typeof v.preciseLocationCipher === "string" ? v.preciseLocationCipher : undefined,
            reportId: typeof v.reportId === "string" ? v.reportId : undefined,
          });
        }
      }
    }
  } catch {
    byHash.clear(); // corrupt / partial file -> start empty, never throw
    notifiedKeys.clear();
  }
}

function flushNow(): void {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  try {
    const dir = dirname(storePath);
    if (dir && dir !== "." && !existsSync(dir)) mkdirSync(dir, { recursive: true });
    const tmp = `${storePath}.tmp`;
    const out: Record<string, unknown> = Object.fromEntries(byHash);
    if (notifiedKeys.size > 0) out[NOTIFIED_KEYS_FIELD] = [...notifiedKeys];
    writeFileSync(tmp, JSON.stringify(out));
    renameSync(tmp, storePath);
  } catch {
    // Best-effort: a failed disk write must never break the request path.
  }
}

function scheduleFlush(): void {
  if (flushTimer) return;
  flushTimer = setTimeout(flushNow, FLUSH_DEBOUNCE_MS);
  if (typeof flushTimer.unref === "function") flushTimer.unref();
}

process.on("beforeExit", flushNow);
process.once("SIGTERM", () => {
  flushNow();
  process.exit(143);
});

load();

export function upsertProof(payload: ProofPublicPayload, reportId?: string): void {
  if (!byHash.has(payload.proofHash)) {
    byHash.set(payload.proofHash, { payload, attestations: [], reportId });
    scheduleFlush();
  }
}

/** The dedup key for a proof's report: its reportId when grouped, else its own proofHash. */
export function reportKeyFor(entry: Entry): string {
  return entry.reportId ?? entry.payload.proofHash;
}

/** True once the programme team has been notified for this report/proof dedup key. */
export function wasNotified(key: string): boolean {
  return notifiedKeys.has(key);
}

/** Mark a report/proof dedup key as notified so it is never messaged again. */
export function markNotified(key: string): void {
  if (!notifiedKeys.has(key)) {
    notifiedKeys.add(key);
    scheduleFlush();
  }
}

export function addAttestation(proofHash: string, rec: AttestationRecord): void {
  const entry = byHash.get(proofHash);
  if (entry && !entry.attestations.some((a) => a.attester === rec.attester)) {
    entry.attestations.push(rec);
    scheduleFlush();
  }
}

/** Record a verified attribute against a proof. Only the boolean + name + timestamp are kept. */
export function setVerifiedAttribute(proofHash: string, rec: VerifiedAttributeRecord): boolean {
  const entry = byHash.get(proofHash);
  if (!entry) return false;
  entry.verifiedAttribute = { attribute: rec.attribute, value: rec.value, checkedAt: rec.checkedAt };
  scheduleFlush();
  return true;
}

/** Record the selfie liveness verdict against a proof. Idempotent. False if the proof is unknown. */
export function setVerifiedPerson(proofHash: string, value: boolean): boolean {
  const entry = byHash.get(proofHash);
  if (!entry) return false;
  entry.verifiedPerson = value;
  scheduleFlush();
  return true;
}

/**
 * Store the opaque encrypted precise-location blob against a proof. The value is never
 * parsed or decrypted here and never leaves via a public route. False if the proof is unknown.
 */
export function setPreciseLocationCipher(proofHash: string, cipher: string): boolean {
  const entry = byHash.get(proofHash);
  if (!entry) return false;
  entry.preciseLocationCipher = cipher;
  scheduleFlush();
  return true;
}

export function getProof(proofHash: string): Entry | undefined {
  return byHash.get(proofHash);
}

export function allProofs(): Entry[] {
  return [...byHash.values()];
}

/** Test-only: repoint at a temp file and reload from disk. Not used by the running server. */
export function __setStorePathForTests(p: string): void {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  storePath = p;
  load();
}

/** Test-only: force a synchronous flush, bypassing the debounce. */
export function __flushForTests(): void {
  flushNow();
}
