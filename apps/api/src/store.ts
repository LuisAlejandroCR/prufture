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

interface Entry {
  payload: ProofPublicPayload;
  attestations: AttestationRecord[];
  verifiedAttribute?: VerifiedAttributeRecord;
}

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
let flushTimer: NodeJS.Timeout | null = null;

function load(): void {
  byHash.clear();
  let raw: string;
  try {
    raw = readFileSync(storePath, "utf8");
  } catch {
    return; // absent file -> start empty
  }
  try {
    const obj = JSON.parse(raw) as Record<string, Entry>;
    if (obj && typeof obj === "object") {
      for (const [hash, v] of Object.entries(obj)) {
        if (v && typeof v === "object" && v.payload && typeof v.payload === "object") {
          byHash.set(hash, {
            payload: v.payload,
            attestations: Array.isArray(v.attestations) ? v.attestations : [],
            verifiedAttribute: v.verifiedAttribute,
          });
        }
      }
    }
  } catch {
    byHash.clear(); // corrupt / partial file -> start empty, never throw
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
    writeFileSync(tmp, JSON.stringify(Object.fromEntries(byHash)));
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

export function upsertProof(payload: ProofPublicPayload): void {
  if (!byHash.has(payload.proofHash)) {
    byHash.set(payload.proofHash, { payload, attestations: [] });
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
