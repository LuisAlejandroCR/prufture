// store.ts: durable attestation index keyed by proofHash, persisted as one JSON file (atomic rename).
// Holds only the zero-PII public payload, attestation records and boolean verdicts. Needs a persistent
// disk; to run on ephemeral storage swap load()/flushNow() for hosted KV (see SWAP POINT below).

import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import type { ProofPublicPayload } from "@proof/core";

export interface AttestationRecord {
  attester: string;
  txHash: string;
  attestedAt: string;
}

/**
 * Coordinator triage verdict on a proof. Deliberately carries NO reviewer identity — the paid
 * surface authenticates per request via RevenueCat, it does not build a reviewer directory.
 * `note` is coordinator free text and must never reach a public route.
 */
export interface ReviewRecord {
  status: "pending" | "accepted" | "rejected";
  note: string;
  reviewedAt: string;
}

export interface Entry {
  payload: ProofPublicPayload;
  attestations: AttestationRecord[];
  /** Selfie liveness verdict. Boolean only, set by /liveness-result. */
  verifiedPerson?: boolean;
  /** True when the liveness verdict above was recorded while the provider was degraded (not a real fail). */
  verifiedPersonDegraded?: boolean;
  /**
   * Encrypted precise-location point, sealed on the device to the programme team's key.
   * Opaque hex — this process never decrypts or parses it, and it is NEVER returned by
   * any public route (see docs/location_privacy.md).
   */
  preciseLocationCipher?: string;
  /** Coordinator triage verdict. Absent until /coordinator/review is called; reads as "pending". */
  review?: ReviewRecord;
  // Groups 1..N signed proofs of one field report. NOT part of the signed payload and never
  // exposed on a public route — used only to send ONE programme notification per report.
  reportId?: string;
  /**
   * Semaphore group-membership result. Only "verified" is ever persisted: the route is
   * unauthenticated, so a failed attempt must not be able to mark someone else's report.
   */
  membership?: "verified";
}

/** One programme's enrolled commitments and the roots a proof may be made against. */
export interface PersonhoodGroupRecord {
  commitments: string[];
  /** Newest last. Older roots stay accepted so a device with a stale group can still prove. */
  roots: string[];
  /** Bumped by a coordinator to open a new round; part of the nullifier scope. */
  epoch: number;
}

// Reserved top-level JSON key (never a 64-hex proofHash) holding the dedup keys already
// notified to the programme team, so one report is never messaged twice across a restart.
const NOTIFIED_KEYS_FIELD = "__notifiedKeys__";
// Reserved keys for the personhood layer. Nullifiers are private: no route ever returns them.
const PERSONHOOD_GROUPS_FIELD = "__personhoodGroups__";
const NULLIFIERS_FIELD = "__nullifiers__";
// Reserved key for sealed-evidence bookkeeping (see evidence.ts). Side data only: the blob itself
// lives in the storage adapter, and nothing here is part of an Entry or any public route.
const EVIDENCE_FIELD = "__evidence__";

/**
 * Bookkeeping for one proof's sealed evidence photo. Holds times, a size and a digest of the
 * CIPHERTEXT — never the blob, never a key, never anything derived from the plaintext photo.
 */
export interface EvidenceRecord {
  /** Set when a coordinator asked for this proof's photo. */
  requestedAt?: string;
  /** Set when a sealed blob was written to storage. */
  storedAt?: string;
  /** Sealed blob size in bytes. */
  bytes?: number;
  /** sha256 hex of the sealed blob, so an identical app retry is idempotent. */
  cipherSha256?: string;
  /** Set when the retention purge deleted the blob. */
  purgedAt?: string;
  /**
   * sha256 hex of the device's per-proof evidence token, registered on the proof's FIRST /sync only.
   * /evidence and /evidence-requests require the matching token, so knowing a public proofHash is
   * not enough to upload for, or learn about requests on, someone else's report.
   */
  tokenHash?: string;
}

// SWAP POINT: a JSON file needs a host with a persistent writable disk (Render disk, Railway or
// Fly volume) — NOT Vercel serverless. If apps/api is deployed somewhere ephemeral, replace only
// load() and flushNow() with a hosted KV or SQLite client (Turso, Upstash Redis) behind these same
// exported functions; no caller and no test outside this file needs to change.
const FLUSH_DEBOUNCE_MS = 50;

function defaultStorePath(): string {
  if (process.env.STORE_PATH) return process.env.STORE_PATH;
  // Under `node --test` each file runs in its own process; keep the repo tree clean. The name must be
  // unique per RUN: pid-only names were recycled across runs and loaded a stale store, making "unknown
  // proofHash => 404" assertions flaky. The random part prevents that; the exit hook cleans up.
  if (process.env.NODE_TEST_CONTEXT) {
    const path = join(tmpdir(), `prufture-store-test-${process.pid}-${randomUUID()}.json`);
    process.on("exit", () => {
      try {
        rmSync(path, { force: true });
        rmSync(`${path}.tmp`, { force: true });
      } catch {
        // Best-effort cleanup; a leftover temp file must never fail a test run.
      }
    });
    return path;
  }
  return "./.data/store.json";
}

let storePath = defaultStorePath();
const byHash = new Map<string, Entry>();
const notifiedKeys = new Set<string>();
const personhoodGroups = new Map<string, PersonhoodGroupRecord>();
const nullifiers = new Set<string>();
const evidence = new Map<string, EvidenceRecord>();
let flushTimer: NodeJS.Timeout | null = null;

/**
 * Re-validate attestation records on the way in, for the same reason `review` is re-validated
 * below: the store file is the one input this module does not produce itself, and /proof/:hash
 * serves `attestations` as an array rather than picking fields from it. Without this, any extra
 * key present in the file — from a hand edit, a restore, a migration, or a future writer — is
 * served on a public, unauthenticated endpoint. Exactly three keys survive.
 */
function sanitizeAttestations(value: unknown): AttestationRecord[] {
  if (!Array.isArray(value)) return [];
  const out: AttestationRecord[] = [];
  for (const rec of value) {
    if (!rec || typeof rec !== "object") continue;
    const r = rec as Record<string, unknown>;
    if (typeof r.attester !== "string" || typeof r.txHash !== "string") continue;
    out.push({
      attester: r.attester,
      txHash: r.txHash,
      attestedAt: typeof r.attestedAt === "string" ? r.attestedAt : "",
    });
  }
  return out;
}

function load(): void {
  byHash.clear();
  notifiedKeys.clear();
  personhoodGroups.clear();
  nullifiers.clear();
  evidence.clear();
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
        if (hash === NULLIFIERS_FIELD) {
          if (Array.isArray(value)) for (const k of value) if (typeof k === "string") nullifiers.add(k);
          continue;
        }
        if (hash === PERSONHOOD_GROUPS_FIELD) {
          loadGroups(value);
          continue;
        }
        if (hash === EVIDENCE_FIELD) {
          loadEvidence(value);
          continue;
        }
        const v = value as Entry;
        if (v && typeof v === "object" && v.payload && typeof v.payload === "object") {
          byHash.set(hash, {
            payload: v.payload,
            attestations: sanitizeAttestations(v.attestations),
            verifiedPerson: typeof v.verifiedPerson === "boolean" ? v.verifiedPerson : undefined,
            verifiedPersonDegraded:
              typeof v.verifiedPersonDegraded === "boolean" ? v.verifiedPersonDegraded : undefined,
            preciseLocationCipher:
              typeof v.preciseLocationCipher === "string" ? v.preciseLocationCipher : undefined,
            // Re-validated on the way in: a hand-edited or truncated file must not resurrect a
            // review with a status the route layer would never accept.
            review:
              v.review &&
              typeof v.review === "object" &&
              (v.review.status === "pending" ||
                v.review.status === "accepted" ||
                v.review.status === "rejected")
                ? {
                    status: v.review.status,
                    note: typeof v.review.note === "string" ? v.review.note : "",
                    reviewedAt: typeof v.review.reviewedAt === "string" ? v.review.reviewedAt : "",
                  }
                : undefined,
            reportId: typeof v.reportId === "string" ? v.reportId : undefined,
            membership: v.membership === "verified" ? "verified" : undefined,
          });
        }
      }
    }
  } catch {
    byHash.clear(); // corrupt / partial file -> start empty, never throw
    notifiedKeys.clear();
    personhoodGroups.clear();
    nullifiers.clear();
    evidence.clear();
  }
}

const isShortString = (x: unknown): x is string => typeof x === "string" && x.length > 0 && x.length <= 40;

/** Whitelist every evidence field on the way in; unknown keys in the file are dropped. */
function loadEvidence(value: unknown): void {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  for (const [hash, r] of Object.entries(value as Record<string, unknown>)) {
    if (!r || typeof r !== "object") continue;
    const v = r as Record<string, unknown>;
    const rec: EvidenceRecord = {};
    if (isShortString(v.requestedAt)) rec.requestedAt = v.requestedAt;
    if (isShortString(v.storedAt)) rec.storedAt = v.storedAt;
    if (typeof v.bytes === "number" && Number.isSafeInteger(v.bytes) && v.bytes >= 0) rec.bytes = v.bytes;
    if (typeof v.cipherSha256 === "string" && /^[0-9a-f]{64}$/.test(v.cipherSha256)) {
      rec.cipherSha256 = v.cipherSha256;
    }
    if (isShortString(v.purgedAt)) rec.purgedAt = v.purgedAt;
    if (typeof v.tokenHash === "string" && /^[0-9a-f]{64}$/.test(v.tokenHash)) rec.tokenHash = v.tokenHash;
    if (Object.keys(rec).length > 0) evidence.set(hash, rec);
  }
}

const isNumeric = (x: unknown): x is string => typeof x === "string" && /^\d{1,78}$/.test(x);

function loadGroups(value: unknown): void {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  for (const [id, g] of Object.entries(value as Record<string, unknown>)) {
    if (!g || typeof g !== "object") continue;
    const r = g as Record<string, unknown>;
    const commitments = Array.isArray(r.commitments) ? r.commitments.filter(isNumeric) : [];
    const roots = Array.isArray(r.roots) ? r.roots.filter(isNumeric) : [];
    const epoch = typeof r.epoch === "number" && Number.isSafeInteger(r.epoch) && r.epoch >= 1 ? r.epoch : 1;
    personhoodGroups.set(id, { commitments, roots, epoch });
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
    if (personhoodGroups.size > 0) out[PERSONHOOD_GROUPS_FIELD] = Object.fromEntries(personhoodGroups);
    if (nullifiers.size > 0) out[NULLIFIERS_FIELD] = [...nullifiers];
    if (evidence.size > 0) out[EVIDENCE_FIELD] = Object.fromEntries(evidence);
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

/**
 * Record the selfie liveness verdict against a proof. Idempotent. False if the proof is unknown.
 * `degraded` marks that the verdict came back false because the provider was unavailable, not
 * because a live person check actually failed — so callers can tell "unavailable" from "invalid".
 */
export function setVerifiedPerson(proofHash: string, value: boolean, degraded = false): boolean {
  const entry = byHash.get(proofHash);
  if (!entry) return false;
  entry.verifiedPerson = value;
  entry.verifiedPersonDegraded = degraded;
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

/**
 * Record a coordinator triage verdict against a proof. Replaces any previous verdict — the
 * store holds the current state, not an audit trail. False if the proof is unknown.
 */
export function setReview(proofHash: string, rec: ReviewRecord): boolean {
  const entry = byHash.get(proofHash);
  if (!entry) return false;
  entry.review = rec;
  scheduleFlush();
  return true;
}

/** Record a verified membership proof against a report. Write-once. False if the proof is unknown. */
export function setMembershipVerified(proofHash: string): boolean {
  const entry = byHash.get(proofHash);
  if (!entry) return false;
  if (entry.membership !== "verified") {
    entry.membership = "verified";
    scheduleFlush();
  }
  return true;
}

export function getPersonhoodGroup(programmeId: string): PersonhoodGroupRecord | undefined {
  return personhoodGroups.get(programmeId);
}

export function putPersonhoodGroup(programmeId: string, group: PersonhoodGroupRecord): void {
  personhoodGroups.set(programmeId, group);
  scheduleFlush();
}

export function hasNullifier(key: string): boolean {
  return nullifiers.has(key);
}

export function addNullifier(key: string): void {
  if (!nullifiers.has(key)) {
    nullifiers.add(key);
    scheduleFlush();
  }
}

export function getEvidenceRecord(proofHash: string): EvidenceRecord | undefined {
  const r = evidence.get(proofHash);
  return r ? { ...r } : undefined;
}

/** Replace a proof's evidence record; `undefined` removes it. */
export function putEvidenceRecord(proofHash: string, rec: EvidenceRecord | undefined): void {
  if (rec === undefined) evidence.delete(proofHash);
  else evidence.set(proofHash, { ...rec });
  scheduleFlush();
}

export function allEvidenceRecords(): [string, EvidenceRecord][] {
  return [...evidence.entries()].map(([h, r]) => [h, { ...r }]);
}

export function getProof(proofHash: string): Entry | undefined {
  return byHash.get(proofHash);
}

export function allProofs(): Entry[] {
  return [...byHash.values()];
}

/** Test-only: the path this process is actually using. Not used by the running server. */
export function __storePathForTests(): string {
  return storePath;
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
