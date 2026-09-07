// sync.ts: push pending proofs to the api when connectivity returns.
// PURE and injectable (fetch + queue fns are passed in) so it unit-tests off-device.
// Sends ONLY the 6 SignedProof fields via toSignedProof() — mediaUri and local
// columns can never leak. Mirrors @proof/core result.ts semantics: never throws.

import type { QueuedProof, SignedProof } from "@proof/core";

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
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
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
      const res = await deps.fetchImpl(`${base}/sync`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(toSignedProof(row)),
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
      } else if (data.status === "synced") {
        await deps.markSynced(row.id);
        summary.synced += 1;
      } else {
        summary.failed += 1;
        summary.errors.push(`${row.id}: unexpected status ${String(data.status)}`);
      }
    } catch (e) {
      summary.failed += 1;
      summary.errors.push(`${row.id}: ${errMsg(e)}`);
    }
  }

  return summary;
}
