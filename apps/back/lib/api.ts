// api.ts: server-side fetch helpers against @proof/api. Degrades to null on any failure.

const BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8787";

export interface ProofView {
  proofHash: string;
  taskId: string;
  geohash: string;
  capturedAt: string;
  attestationCount: number;
  attestations: { attester: string; txHash: string; attestedAt: string }[];
}

export interface ProofSummary {
  proofHash: string;
  taskId: string;
  geohashRegion: string;
  capturedAt: string;
  attestationCount: number;
}

export async function fetchProof(hash: string): Promise<ProofView | null> {
  try {
    const r = await fetch(`${BASE}/proof/${hash}`, { cache: "no-store" });
    return r.ok ? ((await r.json()) as ProofView) : null;
  } catch {
    return null;
  }
}

export async function fetchProofs(): Promise<ProofSummary[]> {
  try {
    const r = await fetch(`${BASE}/proofs`, { cache: "no-store" });
    return r.ok ? ((await r.json()) as ProofSummary[]) : [];
  } catch {
    return [];
  }
}
