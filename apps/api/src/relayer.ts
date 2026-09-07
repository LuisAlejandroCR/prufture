// relayer.ts: submits an EAS attestation on Base Sepolia via Dwellir RPC, paying gas.
// Least privilege: this key may only call attest(). It never moves user funds.
// TODO(block2): encode the real EAS schema + call attest on env.easContract with viem.

import { guard, type ExternalResult, type ProofPublicPayload } from "@proof/core";
import { env, relayerConfigured } from "./env.js";

export interface AttestResult {
  txHash: string;
  attester: string;
}

export async function submitAttestation(payload: ProofPublicPayload): Promise<ExternalResult<AttestResult>> {
  if (!relayerConfigured()) {
    return {
      available: false,
      source: "relayer/eas",
      checkedAt: new Date().toISOString(),
      data: null,
      error: "relayer not configured (DWELLIR_RPC_URL / RELAYER_PRIVATE_KEY / EAS_SCHEMA_UID missing)",
    };
  }
  return guard("relayer/eas", async () => {
    // Placeholder wiring — replaced in block 2 with a real viem walletClient.writeContract.
    void env;
    void payload;
    throw new Error("EAS submission not implemented yet");
  });
}
