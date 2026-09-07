// page.tsx: public /verify/[hash] — shows attestation status without login. Block 4 acceptance surface.

import { fetchProof } from "../../../lib/api";

export default async function VerifyPage({ params }: { params: Promise<{ hash: string }> }) {
  const { hash } = await params;
  const proof = await fetchProof(hash);

  if (!proof) {
    return (
      <section>
        <h1>Proof not found</h1>
        <p>
          No attestation is indexed for <code>{hash}</code> yet. If a volunteer just captured it, the
          queue may not have synced.
        </p>
      </section>
    );
  }

  return (
    <section>
      <h1>Verified proof</h1>
      <dl>
        <dt>Hash</dt>
        <dd><code>{proof.proofHash}</code></dd>
        <dt>Task</dt>
        <dd>{proof.taskId}</dd>
        <dt>Region (geohash)</dt>
        <dd>{proof.geohash}</dd>
        <dt>Captured at</dt>
        <dd>{proof.capturedAt}</dd>
        <dt>Status</dt>
        <dd>{proof.attestationCount > 0 ? `attested by ${proof.attestationCount}` : "synced, not yet attested"}</dd>
      </dl>
      {proof.attestations.length > 0 && (
        <ul>
          {proof.attestations.map((a) => (
            <li key={a.txHash}>
              <a href={`https://sepolia.basescan.org/tx/${a.txHash}`}>{a.txHash.slice(0, 18)}…</a> by {a.attester.slice(0, 10)}…
            </li>
          ))}
        </ul>
      )}
      <p style={{ color: "#555" }}>No volunteer identity is stored or shown. This page is safe to share.</p>
    </section>
  );
}
