// evidence.ts: rules for sealed evidence photos — decode and vet an uploaded blob (size cap, sealed
// shape, refuse anything that looks like a plaintext image), key it in storage, and purge blobs past
// EVIDENCE_RETENTION_DAYS. The api never holds a decrypt key; a blob is opaque ciphertext here.

import { createHash } from "node:crypto";
import { env } from "./env.js";
import type { EvidenceStorage } from "./evidence-storage.js";
import { allEvidenceRecords, putEvidenceRecord } from "./store.js";

/** ephemeral X25519 pub (32) + XChaCha20 nonce (24) + Poly1305 tag (16): the smallest sealed blob. */
export const SEALED_OVERHEAD = 32 + 24 + 16;
/** How many proofHashes one request-check call may ask about. */
export const MAX_REQUEST_CHECK = 200;

export const isProofHash = (x: unknown): x is string => typeof x === "string" && /^[0-9a-f]{64}$/.test(x);

/** Storage object key for a proof's sealed photo. proofHash is validated hex, so the key is safe. */
export function evidenceKey(proofHash: string): string {
  return `evidence/${proofHash}`;
}

/** Largest base64 string that can decode to `maxBytes`. Used for the route's body limit. */
export function maxBase64Len(maxBytes: number): number {
  return Math.ceil(maxBytes / 3) * 4;
}

const startsWith = (b: Uint8Array, sig: number[], at = 0) => sig.every((v, i) => b[at + i] === v);
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

/**
 * True when `b` starts like a common plaintext image container. A sealed blob starts with a random
 * ephemeral public key, so a false positive is ~2^-24 per upload and the app simply re-seals (a new
 * ephemeral key) and retries. This is a tripwire for a client bug, not the privacy guarantee — the
 * guarantee is that the app only ever uploads sealEvidence() output.
 */
export function looksLikePlaintextImage(b: Uint8Array): boolean {
  return (
    startsWith(b, [0xff, 0xd8, 0xff]) || // JPEG
    startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) || // PNG
    startsWith(b, ascii("GIF8")) || // GIF
    (startsWith(b, ascii("RIFF")) && startsWith(b, ascii("WEBP"), 8)) || // WebP
    startsWith(b, ascii("ftyp"), 4) || // HEIC / HEIF / AVIF / MP4
    startsWith(b, [0x49, 0x49, 0x2a, 0x00]) || // TIFF little-endian
    startsWith(b, [0x4d, 0x4d, 0x00, 0x2a]) // TIFF big-endian
  );
}

export type DecodeResult =
  | { ok: true; bytes: Uint8Array; sha256: string }
  | { ok: false; status: 400 | 413; error: string };

/** Decode and vet an uploaded base64 blob. Never throws. */
export function decodeSealedBlob(cipher: unknown, maxBytes = env.evidenceMaxBytes): DecodeResult {
  if (typeof cipher !== "string" || cipher.length === 0) return { ok: false, status: 400, error: "missing cipher" };
  if (cipher.length > maxBase64Len(maxBytes)) return { ok: false, status: 413, error: "evidence too large" };
  if (cipher.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(cipher)) {
    return { ok: false, status: 400, error: "cipher must be base64" };
  }
  const bytes = new Uint8Array(Buffer.from(cipher, "base64"));
  if (bytes.length > maxBytes) return { ok: false, status: 413, error: "evidence too large" };
  if (bytes.length <= SEALED_OVERHEAD) return { ok: false, status: 400, error: "not a sealed blob" };
  if (looksLikePlaintextImage(bytes)) {
    return { ok: false, status: 400, error: "plaintext image refused; seal on the device first" };
  }
  return { ok: true, bytes, sha256: createHash("sha256").update(bytes).digest("hex") };
}

export interface PurgeSummary {
  purged: number;
  failed: number;
  expiredRequests: number;
}

/**
 * Delete every blob stored longer than `retentionDays`, and drop coordinator requests that were
 * never answered within the same window. A blob whose delete fails keeps its record, so the next
 * run retries it. Never throws.
 */
export async function purgeExpiredEvidence(
  storage: EvidenceStorage,
  now: number = Date.now(),
  retentionDays: number = env.evidenceRetentionDays,
): Promise<PurgeSummary> {
  const cutoff = now - retentionDays * 24 * 60 * 60 * 1000;
  const summary: PurgeSummary = { purged: 0, failed: 0, expiredRequests: 0 };
  const older = (iso: string | undefined) => {
    const t = iso ? Date.parse(iso) : NaN;
    return Number.isFinite(t) && t <= cutoff;
  };

  for (const [hash, rec] of allEvidenceRecords()) {
    if (rec.storedAt && !rec.purgedAt) {
      if (!older(rec.storedAt)) continue;
      const res = await storage.delete(evidenceKey(hash)).catch(() => null);
      if (res?.available) {
        putEvidenceRecord(hash, { purgedAt: new Date(now).toISOString() });
        summary.purged += 1;
      } else {
        summary.failed += 1;
      }
    } else if (!rec.storedAt && !rec.purgedAt && older(rec.requestedAt)) {
      putEvidenceRecord(hash, undefined);
      summary.expiredRequests += 1;
    }
  }
  return summary;
}

/** Coordinator-facing state of one proof's evidence. */
export type EvidenceState = "none" | "requested" | "available" | "expired";

export function evidenceState(rec: { requestedAt?: string; storedAt?: string; purgedAt?: string } | undefined): EvidenceState {
  if (!rec) return "none";
  if (rec.purgedAt) return "expired";
  if (rec.storedAt) return "available";
  if (rec.requestedAt) return "requested";
  return "none";
}
