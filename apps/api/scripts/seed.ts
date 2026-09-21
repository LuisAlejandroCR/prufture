// seed.ts: POST two core-signed proofs to a running api so a fresh deploy has data at
// /dashboard and a sample /verify/<hash>. Zero PII: the payload is only the 4 public fields.
// Usage: npx tsx apps/api/scripts/seed.ts <api-base-url>   (default http://localhost:8787)
// Distinct from register-schema.ts (one-off on-chain schema setup); this only calls POST /sync.

import { hashBytes, signPayload, type ProofPublicPayload } from "@proof/core";

const BASE = (process.argv[2] ?? process.env.SEED_BASE_URL ?? "http://localhost:8787").replace(/\/+$/, "");

// Fixed demo device key so re-running seed keeps the same publicKey and proofHashes.
const SEED_KEY = "1".repeat(64);

const SAMPLES = [
  { taskId: "solar-panel-install", geohash: "u6sce", note: "seed: solar panel installation" },
  { taskId: "water-pump-repair", geohash: "9q8yy", note: "seed: water pump repair" },
] as const;

function proofFor(s: (typeof SAMPLES)[number]): ProofPublicPayload {
  return {
    proofHash: hashBytes(new TextEncoder().encode(`${s.note}|${s.taskId}`)),
    taskId: s.taskId,
    geohash: s.geohash,
    capturedAt: new Date().toISOString(),
  };
}

async function main() {
  console.log(`Seeding ${SAMPLES.length} proofs -> ${BASE}/sync`);
  const hashes: string[] = [];
  for (const s of SAMPLES) {
    const signed = signPayload(proofFor(s), SEED_KEY);
    hashes.push(signed.proofHash);
    const r = await fetch(`${BASE}/sync`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(signed),
    });
    const body = (await r.json().catch(() => ({}))) as { status?: string; error?: string };
    if (!r.ok) {
      console.error(`  FAIL ${s.taskId}: ${r.status} ${body.error ?? ""}`);
      process.exitCode = 1;
      continue;
    }
    console.log(`  ok   ${s.taskId}  ${signed.proofHash}  (${body.status})`);
  }
  console.log(`\nSeeded proof hash for a sample /verify page:\n  ${hashes[0]}`);
}

main().catch((e) => {
  console.error("seed failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
