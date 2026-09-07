// page.tsx: public /verify/[hash] — shows attestation status without login. Block 4 acceptance surface.
// Three honest states: verified proof, proof not indexed yet, verification service unreachable.
// Only a coarse region is shown; no volunteer identity, no exact geohash, no GPS.

import Link from "next/link";
import { fetchProof } from "../../../lib/api";
import { ShareLink } from "./ShareLink";

const VERIFY_BASE = process.env.NEXT_PUBLIC_VERIFY_BASE_URL ?? "http://localhost:3000";

function StatusPill({ count }: { count: number }) {
  const attested = count > 0;
  return (
    <span className={`pill ${attested ? "ok" : "wait"}`}>
      <span className="dot" aria-hidden />
      {attested ? `attested by ${count}` : "synced, not yet attested"}
    </span>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <section className="fade-in">
      <p style={{ marginBottom: "var(--sp-4)" }}>
        <Link href="/" className="faint" style={{ fontSize: "0.9rem", textDecoration: "none" }}>
          ← Prufture
        </Link>
      </p>
      {children}
    </section>
  );
}

export default async function VerifyPage({ params }: { params: Promise<{ hash: string }> }) {
  const { hash } = await params;
  const result = await fetchProof(hash);
  const shareUrl = `${VERIFY_BASE}/verify/${hash}`;

  if (result.state === "unreachable") {
    return (
      <Shell>
        <h1>Verification service unavailable</h1>
        <p className="muted">
          The public index could not be reached right now. The proof for <code>{hash}</code> is not
          lost: attestations live on-chain. Try again shortly.
        </p>
        <ShareLink url={shareUrl} />
      </Shell>
    );
  }

  if (result.state === "not_found") {
    return (
      <Shell>
        <h1>Proof not indexed yet</h1>
        <p className="muted">
          No attestation is indexed for <code>{hash}</code> yet. If a volunteer just captured it, the
          offline queue may not have synced.
        </p>
        <ShareLink url={shareUrl} />
      </Shell>
    );
  }

  const { proof } = result;

  return (
    <Shell>
      <h1>Verified proof</h1>
      <StatusPill count={proof.attestationCount} />

      <dl className="fields">
        <dt>Hash</dt>
        <dd>
          <code>{proof.proofHash}</code>
        </dd>
        <dt>Task</dt>
        <dd>{proof.taskId}</dd>
        <dt>Region</dt>
        <dd>
          <code>{proof.geohashRegion}</code> <span className="faint">coarse geohash, approximate area only</span>
        </dd>
        <dt>Captured</dt>
        <dd>{proof.capturedAt}</dd>
      </dl>

      {proof.attestations.length > 0 ? (
        <>
          <h2>Attestations</h2>
          <ul className="plain">
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
        <p className="pill wait" style={{ marginTop: "var(--sp-4)" }}>
          Synced to the index. No on-chain attestation yet: a second reviewer can still attest, or
          the relayer is degraded.
        </p>
      )}

      <h2>Share</h2>
      <p className="muted">
        This link carries only the hash. No volunteer identity, media, or exact location is stored or
        shown, so it is safe to send over WhatsApp or email.
      </p>
      <ShareLink url={shareUrl} />
    </Shell>
  );
}
