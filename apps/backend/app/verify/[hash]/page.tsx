// page.tsx: public /verify/[hash] — shows attestation status without login. Block 4 acceptance surface.
// Three honest states: verified proof, proof not indexed yet, verification service unreachable.
// Only a coarse region is shown; no volunteer identity, no exact geohash, no GPS.

import { fetchProof } from "../../../lib/api";
import { ShareLink } from "./ShareLink";

const VERIFY_BASE = process.env.NEXT_PUBLIC_VERIFY_BASE_URL ?? "http://localhost:3000";

function StatusBadge({ count }: { count: number }) {
  const attested = count > 0;
  return (
    <span
      style={{
        display: "inline-block",
        padding: "4px 10px",
        borderRadius: 999,
        fontWeight: 600,
        fontSize: 14,
        background: attested ? "#1a7f37" : "#8a6d00",
        color: "#fff",
      }}
    >
      {attested ? `attested by ${count}` : "synced · not yet attested"}
    </span>
  );
}

export default async function VerifyPage({ params }: { params: Promise<{ hash: string }> }) {
  const { hash } = await params;
  const result = await fetchProof(hash);
  const shareUrl = `${VERIFY_BASE}/verify/${hash}`;

  if (result.state === "unreachable") {
    return (
      <section>
        <h1>Verification service unavailable</h1>
        <p>
          The public index could not be reached right now. The proof for <code>{hash}</code> is not
          lost — attestations live on-chain. Try again shortly.
        </p>
        <ShareLink url={shareUrl} />
      </section>
    );
  }

  if (result.state === "not_found") {
    return (
      <section>
        <h1>Proof not indexed yet</h1>
        <p>
          No attestation is indexed for <code>{hash}</code> yet. If a volunteer just captured it, the
          offline queue may not have synced.
        </p>
        <ShareLink url={shareUrl} />
      </section>
    );
  }

  const { proof } = result;

  return (
    <section>
      <h1>Verified proof</h1>
      <p>
        <StatusBadge count={proof.attestationCount} />
      </p>
      <dl>
        <dt>Hash</dt>
        <dd>
          <code>{proof.proofHash}</code>
        </dd>
        <dt>Task</dt>
        <dd>{proof.taskId}</dd>
        <dt>Region (coarse geohash)</dt>
        <dd>
          <code>{proof.geohashRegion}</code> <span style={{ color: "#777" }}>— approximate area only</span>
        </dd>
        <dt>Captured at</dt>
        <dd>{proof.capturedAt}</dd>
      </dl>

      {proof.attestations.length > 0 ? (
        <>
          <h2>Attestations</h2>
          <ul>
            {proof.attestations.map((a) => (
              <li key={a.txHash}>
                <a href={`https://sepolia.basescan.org/tx/${a.txHash}`} rel="noreferrer noopener">
                  {a.txHash.slice(0, 18)}…
                </a>{" "}
                by <code>{a.attester.slice(0, 10)}…</code> · {a.attestedAt}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p style={{ color: "#8a6d00" }}>
          Synced to the index. No on-chain attestation has been recorded yet (a second reviewer can
          still attest, or the relayer is degraded).
        </p>
      )}

      <h2>Share</h2>
      <p style={{ color: "#555" }}>
        This link carries only the hash. No volunteer identity, media, or exact location is stored or
        shown — safe to send over WhatsApp or email.
      </p>
      <ShareLink url={shareUrl} />
    </section>
  );
}
