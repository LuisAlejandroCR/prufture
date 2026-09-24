// relayer.ts: the attestation entry point. It no longer knows how a transaction is signed or
// sent — that is the AttestationSubmitter port (submitter.ts) and its adapters. This module
// selects the adapter and keeps the contract every caller already relies on:
// submitAttestation() returns a typed ExternalResult and never throws the user flow.
//
// The pure EAS request builder lives in relayer-request.ts and is re-exported here so existing
// callers and the invariant tests keep their import path.

import { guard, unavailable, type ExternalResult, type ProofPublicPayload } from "@proof/core";
import { env } from "./env.js";
import { localKeySubmitter } from "./submitters/local-key.js";
import { noneSubmitter } from "./submitters/none.js";
import type { AttestResult, AttestationSubmitter } from "./submitter.js";

export { buildAttestRequest, encodeProofData } from "./relayer-request.js";
export type { AttestResult } from "./submitter.js";

const SUBMITTERS: Record<string, AttestationSubmitter> = {
  "local-key": localKeySubmitter,
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
  return result.available ? result.data : result;
}

export async function submitAttestation(
  payload: ProofPublicPayload,
): Promise<ExternalResult<AttestResult>> {
  const submitter = selectedSubmitter();

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
        : "relayer not configured (RPC_URL / RELAYER_PRIVATE_KEY / EAS_SCHEMA_UID missing)",
    );
  }

  return submitThrough(submitter, payload);
}

// Re-exported so a deployment can assert which chain the allowlist is pinned to.
export const allowlistedChainId = env.chainId;
