// api.ts: server-side fetch helpers against @proof/api. Never throws, and tells "service unreachable"
// (degraded) apart from "proof not indexed" (404) so /verify is honest in each case. The geohash is
// coarsened here, so only a region prefix ever reaches the browser bundle.

const BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8787";

/** How coarse the public region is: geohash chars kept. 5 ≈ ~5 km cell, never exact GPS. */
export const REGION_PREFIX_LEN = 5;

export interface AttestationView {
  attester: string;
  txHash: string;
  attestedAt: string;
}

export interface ProofView {
  proofHash: string;
  taskId: string;
  /** Coarse region only — the raw geohash is dropped before it leaves the server. */
  geohashRegion: string;
  capturedAt: string;
  attestationCount: number;
  attestations: AttestationView[];
  /** Selfie liveness verdict. null until a result is attached. Boolean only, no identity data. */
  verifiedPerson: boolean | null;
  /** True when the verdict above reflects a degraded provider, not an actual failed check. */
  verifiedPersonDegraded: boolean | null;
}

export interface ProofSummary {
  proofHash: string;
  taskId: string;
  geohashRegion: string;
  capturedAt: string;
  attestationCount: number;
}

export type ProofResult =
  | { state: "ok"; proof: ProofView }
  | { state: "not_found" }
  | { state: "unreachable" };

interface RawProof {
  proofHash: string;
  taskId: string;
  /** api already coarsens to a region prefix; kept defensively truncated here too. */
  geohashRegion?: string;
  geohash?: string;
  capturedAt: string;
  attestationCount: number;
  attestations: AttestationView[];
  verifiedPerson?: unknown;
  verifiedPersonDegraded?: unknown;
}

export function toRegion(geohash: string | undefined): string {
  return (geohash ?? "").slice(0, REGION_PREFIX_LEN);
}

export async function fetchProof(hash: string): Promise<ProofResult> {
  let r: Response;
  try {
    r = await fetch(`${BASE}/proof/${encodeURIComponent(hash)}`, { cache: "no-store" });
  } catch {
    return { state: "unreachable" };
  }
  if (r.status === 404) return { state: "not_found" };
  if (!r.ok) return { state: "unreachable" };
  try {
    const raw = (await r.json()) as RawProof;
    return {
      state: "ok",
      proof: {
        proofHash: raw.proofHash,
        taskId: raw.taskId,
        geohashRegion: toRegion(raw.geohashRegion ?? raw.geohash),
        capturedAt: raw.capturedAt,
        attestationCount: raw.attestationCount ?? raw.attestations?.length ?? 0,
        attestations: raw.attestations ?? [],
        verifiedPerson: typeof raw.verifiedPerson === "boolean" ? raw.verifiedPerson : null,
        verifiedPersonDegraded:
          typeof raw.verifiedPersonDegraded === "boolean" ? raw.verifiedPersonDegraded : null,
      },
    };
  } catch {
    return { state: "unreachable" };
  }
}

export async function fetchProofs(): Promise<{ proofs: ProofSummary[]; degraded: boolean }> {
  try {
    const r = await fetch(`${BASE}/proofs`, { cache: "no-store" });
    if (!r.ok) return { proofs: [], degraded: true };
    return { proofs: (await r.json()) as ProofSummary[], degraded: false };
  } catch {
    return { proofs: [], degraded: true };
  }
}
