// sync.ts: pushes pending proofs to the api when connectivity returns. PURE and injectable, never
// throws. The /sync body is the 6 whitelisted SignedProof fields plus the unsigned local reportId,
// so mediaUri and other local columns can never leak.

import type { QueuedProof, SignedProof } from "@proof/core";
import { __attachItems, __resetAttachKind, outboxAdd, outboxItems, outboxRemove } from "./attach-outbox";
import { evidenceTokenFor } from "./evidence-token";
import { flushPendingLiveness } from "./liveness";

/** New captures wait in this state until a sync succeeds. */
export const PENDING_STATUS = "pending_sync";

/**
 * Explicit whitelist. A future QueuedProof field cannot leak to the wire:
 * the request body is built only from these six keys, nothing is spread.
 */
export function toSignedProof(row: QueuedProof): SignedProof {
  return {
    proofHash: row.proofHash,
    taskId: row.taskId,
    geohash: row.geohash,
    capturedAt: row.capturedAt,
    signature: row.signature,
    publicKey: row.publicKey,
  };
}

export interface SyncSummary {
  attempted: number;
  synced: number;
  attested: number;
  failed: number;
  errors: string[];
}

export interface SyncDeps {
  fetchImpl: typeof fetch;
  apiUrl: string;
  listProofs: () => Promise<QueuedProof[]>;
  markSynced: (id: string) => Promise<void>;
  markAttested: (id: string, attestationCount: number) => Promise<void>;
  /**
   * Optional, fire-and-forget: called once a row is accepted by the api. Its result is ignored and
   * never awaited, so it can never slow, fail or change a sync.
   */
  onSynced?: (row: QueuedProof) => unknown;
  /**
   * Optional: sha256 of this proof's evidence token (src/evidence-token.ts), sent alongside the
   * proof. The api keeps it from the FIRST sync only; it gates /evidence and /evidence-requests.
   */
  evidenceTokenHash?: (proofHash: string) => Promise<string | null>;
}

/** The token hash for a row, or null. A failure only means evidence can't be shared later. */
async function tokenHashFor(deps: SyncDeps, proofHash: string): Promise<string | null> {
  if (!deps.evidenceTokenHash) return null;
  try {
    const h = await deps.evidenceTokenHash(proofHash);
    return typeof h === "string" && /^[0-9a-f]{64}$/.test(h) ? h : null;
  } catch {
    return null;
  }
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Runs deps.onSynced without awaiting it; a throw or a rejected promise is swallowed. */
function notifySynced(deps: SyncDeps, row: QueuedProof): void {
  if (!deps.onSynced) return;
  try {
    const out = deps.onSynced(row);
    if (out && typeof (out as Promise<unknown>).catch === "function") {
      (out as Promise<unknown>).catch(() => {});
    }
  } catch {
    // ignore — a post-sync extra never affects the sync
  }
}

/** /sync omits the count; read it from /proof/:hash, fall back to 1 on any failure. */
async function resolveAttestedCount(
  deps: SyncDeps,
  base: string,
  proofHash: string,
  body: Record<string, unknown>,
): Promise<number> {
  if (typeof body.attestationCount === "number") return body.attestationCount;
  try {
    const res = await deps.fetchImpl(`${base}/proof/${encodeURIComponent(proofHash)}`);
    if (!res.ok) return 1;
    const data = (await res.json()) as { attestationCount?: unknown };
    return typeof data.attestationCount === "number" ? data.attestationCount : 1;
  } catch {
    return 1;
  }
}

/**
 * POST every pending row to `${apiUrl}/sync`. 200 "synced" -> markSynced,
 * 200 "attested" -> markAttested(count). Non-200 or a thrown fetch leaves the
 * row pending and records the error. Never throws.
 */
export async function syncPending(deps: SyncDeps): Promise<SyncSummary> {
  const summary: SyncSummary = { attempted: 0, synced: 0, attested: 0, failed: 0, errors: [] };
  const base = deps.apiUrl.replace(/\/+$/, "");

  let rows: QueuedProof[];
  try {
    rows = await deps.listProofs();
  } catch (e) {
    summary.errors.push(`listProofs: ${errMsg(e)}`);
    return summary;
  }

  for (const row of rows.filter((r) => r.status === PENDING_STATUS)) {
    summary.attempted += 1;
    try {
      // The signed payload is exactly the 6 toSignedProof() fields. The local-only
      // reportId rides ALONGSIDE it (not inside, never signed) so the api can send
      // one delivery per field report instead of one per photo. Omitted when absent.
      const reportId = (row as { reportId?: unknown }).reportId;
      const evidenceTokenHash = await tokenHashFor(deps, row.proofHash);
      const body = {
        ...toSignedProof(row),
        ...(typeof reportId === "string" && reportId ? { reportId } : {}),
        ...(evidenceTokenHash ? { evidenceTokenHash } : {}),
      };
      const res = await deps.fetchImpl(`${base}/sync`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        summary.failed += 1;
        summary.errors.push(`${row.id}: HTTP ${res.status}`);
        continue;
      }

      const data = (await res.json()) as Record<string, unknown>;
      if (data.status === "attested") {
        const count = await resolveAttestedCount(deps, base, row.proofHash, data);
        await deps.markAttested(row.id, count);
        summary.attested += 1;
        notifySynced(deps, row);
      } else if (data.status === "synced") {
        await deps.markSynced(row.id);
        summary.synced += 1;
        notifySynced(deps, row);
      } else {
        summary.failed += 1;
        summary.errors.push(`${row.id}: unexpected status ${String(data.status)}`);
      }
    } catch (e) {
      summary.failed += 1;
      summary.errors.push(`${row.id}: ${errMsg(e)}`);
    }
  }

  // Retry any liveness verdicts that could not be attached while offline. Best-effort:
  // this never affects the proof sync result and never throws.
  try {
    await flushPendingLiveness(base, deps.fetchImpl);
  } catch {
    // ignore — a missed attach just leaves verifiedPerson null on /verify
  }

  // Same for any encrypted precise-location blob that could not be posted yet.
  try {
    await flushPendingPreciseLocation(base, deps.fetchImpl);
  } catch {
    // ignore — a missed blob just means the programme team has no precise point for this proof
  }

  return summary;
}

// Encrypted precise location: attach to a proof, with an offline retry buffer.

interface PendingPrecise {
  proofHash: string;
  cipher: string;
}


async function tryPostPrecise(
  apiUrl: string,
  item: PendingPrecise,
  fetchImpl: typeof fetch,
): Promise<boolean> {
  try {
    // The evidence token proves this device synced the proof, so no one else can plant a point.
    const evidenceToken = await evidenceTokenFor(item.proofHash);
    const res = await fetchImpl(`${apiUrl.replace(/\/+$/, "")}/precise-location`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(evidenceToken ? { ...item, evidenceToken } : item),
    });
    // 404 = proof not on the api yet; keep it buffered for the next pass. A 403 (not this device's
    // proof) or 409 (a different point is already stored) will never succeed on retry.
    return res.ok || res.status === 403 || res.status === 409;
  } catch {
    return false;
  }
}

/**
 * Send the encrypted precise-location blob for `proofHash`. Fire-and-forget: on any
 * failure the item is buffered and retried by flushPendingPreciseLocation() next pass.
 */
export async function attachPreciseLocation(
  apiUrl: string,
  proofHash: string,
  cipher: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const item = { proofHash, cipher };
  const done = await tryPostPrecise(apiUrl, item, fetchImpl);
  // Kept on disk (attach-outbox.ts): a report saved offline must keep its precise point when the
  // app is closed before signal comes back.
  if (!done) await outboxAdd({ kind: "precise", proofHash, value: cipher });
}

/** Retry every buffered blob. Called from the sync pass. Never throws. */
export async function flushPendingPreciseLocation(
  apiUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  for (const it of await outboxItems("precise")) {
    const ok = await tryPostPrecise(apiUrl, { proofHash: it.proofHash, cipher: it.value }, fetchImpl).catch(() => false);
    if (ok) await outboxRemove("precise", it.proofHash);
  }
}

/** Test-only: inspect / reset the retry buffer. */
export function __pendingPreciseLocation(): PendingPrecise[] {
  return __attachItems("precise").map((a) => ({ proofHash: a.proofHash, cipher: a.value }));
}
export function __resetPendingPreciseLocation(): void {
  __resetAttachKind("precise");
}
