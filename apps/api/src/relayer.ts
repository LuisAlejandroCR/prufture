// relayer.ts: the attestation entry point. It no longer knows how a transaction is signed or
// sent — that is the AttestationSubmitter port (submitter.ts) and its adapters. This module
// selects the adapter and keeps the contract every caller already relies on:
// submitAttestation() returns a typed ExternalResult and never throws the user flow.
//
// The pure EAS request builder lives in relayer-request.ts and is re-exported here so existing
// callers and the invariant tests keep their import path.

import { guard, ok, unavailable, type ExternalResult, type ProofPublicPayload } from "@proof/core";
import { env } from "./env.js";
import { localKeySubmitter } from "./submitters/local-key.js";
import { noneSubmitter } from "./submitters/none.js";
import { ozRelayerSubmitter } from "./submitters/openzeppelin-relayer.js";
import { publicError, sameAddress, type AttestResult, type AttestationSubmitter } from "./submitter.js";

export { buildAttestRequest, encodeProofData } from "./relayer-request.js";
export type { AttestResult } from "./submitter.js";

const SUBMITTERS: Record<string, AttestationSubmitter> = {
  "local-key": localKeySubmitter,
  "openzeppelin-relayer": ozRelayerSubmitter,
  none: noneSubmitter,
};

/**
 * The adapter this deployment submits through. Defaults to the local-key adapter, which is the
 * behaviour apps/api has always had. An unknown name fails closed to `none` rather than falling
 * back to a key-holding submitter by accident.
 */
export function selectedSubmitter(): AttestationSubmitter {
  const name = process.env.ATTESTATION_SUBMITTER?.trim() || "local-key";
  return SUBMITTERS[name] ?? noneSubmitter;
}

/**
 * Run an adapter and make its typed contract STRUCTURAL rather than a promise.
 *
 * Every adapter today guards internally, so nothing currently throws here. But the whole point
 * of the port is that adapters get added, and one that throws — or returns something that is
 * not an ExternalResult — would otherwise propagate out of /sync and break offline capture,
 * which is the one thing that must never happen. The port enforces the contract it defines.
 */
export async function submitThrough(
  submitter: AttestationSubmitter,
  payload: ProofPublicPayload,
): Promise<ExternalResult<AttestResult>> {
  const result = await guard("relayer/eas", async () => {
    const r = await submitter.submit(payload);
    if (!r || typeof r.available !== "boolean") {
      throw new Error("submitter returned a non-conforming result");
    }
    return r;
  });

  // guard() wraps a conforming envelope in another envelope; unwrap back to the adapter's own.
  const r = result.available ? result.data : result;
  // /sync returns this envelope publicly, so no adapter's error text may carry an endpoint URL.
  return r.available ? r : { ...r, error: publicError(r.error) };
}

export async function submitAttestation(
  payload: ProofPublicPayload,
): Promise<ExternalResult<AttestResult>> {
  return submitVia(selectedSubmitter(), payload);
}

async function submitVia(
  submitter: AttestationSubmitter,
  payload: ProofPublicPayload,
): Promise<ExternalResult<AttestResult>> {

  // isConfigured() is adapter code too, so it is not trusted to stay quiet either.
  let configured: boolean;
  try {
    configured = submitter.isConfigured();
  } catch {
    return unavailable("relayer/eas", `${submitter.name} adapter failed its configuration check`);
  }

  if (!configured) {
    // Same typed shape as before; the message names the config, never a credential.
    return unavailable(
      "relayer/eas",
      submitter.name === "none"
        ? "attestation submitter disabled (ATTESTATION_SUBMITTER=none)"
        : `relayer not configured (${submitter.configHint ?? "RPC_URL / RELAYER_PRIVATE_KEY / EAS_SCHEMA_UID"} missing)`,
    );
  }

  return submitThrough(submitter, payload);
}

/** What a stored attestation must carry for attestOnce() to reuse it. */
export interface PriorAttestation {
  attester: string;
  txHash: string;
}

// One submission per proofHash at a time: a concurrent caller joins the call already in flight
// instead of starting a second transaction for the same proof.
const inFlight = new Map<string, Promise<ExternalResult<AttestResult>>>();

/**
 * The stored attestation this submitter already made, if any. When the adapter can name its
 * attester, only a record from that address counts, so a different key may still add its own.
 * When it cannot, any record counts: re-paying gas for an anchored proof is the failure to avoid.
 */
function priorFor(submitter: AttestationSubmitter, existing: readonly PriorAttestation[]): PriorAttestation | undefined {
  let self: string | null = null;
  try {
    self = submitter.attester?.() ?? null;
  } catch {
    self = null;
  }
  return self ? existing.find((a) => sameAddress(a.attester, self)) : existing[0];
}

/**
 * Idempotent by proofHash — the portability guardrail. /sync and /attest are unauthenticated and
 * proof hashes are public, so without this every re-send, retry or repeated /attest call paid
 * for a fresh on-chain transaction that the store then discarded as a duplicate. The check runs
 * BEFORE the submitter is called; a proof this submitter already anchored returns its stored
 * record as the result.
 */
export async function attestOnce(
  payload: ProofPublicPayload,
  existing: readonly PriorAttestation[],
  submitter: AttestationSubmitter = selectedSubmitter(),
): Promise<ExternalResult<AttestResult>> {
  const prior = priorFor(submitter, existing);
  if (prior) return ok("relayer/eas", { txHash: prior.txHash, attester: prior.attester });

  const pending = inFlight.get(payload.proofHash);
  if (pending) return pending;

  const call = submitVia(submitter, payload).finally(() => inFlight.delete(payload.proofHash));
  inFlight.set(payload.proofHash, call);
  return call;
}

// Re-exported so a deployment can assert which chain the allowlist is pinned to.
export const allowlistedChainId = env.chainId;
