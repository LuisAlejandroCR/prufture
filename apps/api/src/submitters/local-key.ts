// local-key.ts: the compatibility adapter — the behaviour apps/api has always had, now behind
// the AttestationSubmitter port. A private key in the process env signs attest() and the tx
// goes out over env.rpcUrl. It owns key custody and transport only; assertAllowed() owns policy.
//
// Key material never leaves this module: not in the returned envelope, not in an error message.
// guard() converts any throw here into a typed unavailable.

import { guard, type ExternalResult, type ProofPublicPayload } from "@proof/core";
import { createWalletClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { env, relayerConfigured } from "../env.js";
import { buildAttestRequest } from "../relayer-request.js";
import { assertAllowed, type AttestResult, type AttestationSubmitter } from "../submitter.js";

// Explicit per-request budget for the RPC. writeContract makes a handful of calls (nonce, gas,
// fees, send); with one retry each, a dead endpoint degrades in tens of seconds rather than
// holding /sync open on viem's defaults. Retrying the send is safe: it re-broadcasts the same
// signed transaction, so it cannot produce a second attestation.
export const RPC_TIMEOUT_MS = 5000;
export const RPC_RETRY_COUNT = 1;

function privateKeyHex(): Hex {
  return env.relayerPrivateKey.startsWith("0x")
    ? (env.relayerPrivateKey as Hex)
    : (`0x${env.relayerPrivateKey}` as Hex);
}

export const localKeySubmitter: AttestationSubmitter = {
  name: "local-key",

  isConfigured(): boolean {
    return relayerConfigured();
  },

  // Derives the public address locally; nothing is signed or sent, and the key never leaves.
  attester(): string | null {
    if (!relayerConfigured()) return null;
    try {
      return privateKeyToAccount(privateKeyHex()).address;
    } catch {
      return null;
    }
  },

  async submit(payload: ProofPublicPayload): Promise<ExternalResult<AttestResult>> {
    return guard("relayer/eas", async () => {
      const request = buildAttestRequest(payload);

      // Policy first: nothing below runs — and no key is derived — unless the call is allowlisted.
      assertAllowed({ ...request, chainId: baseSepolia.id });

      const account = privateKeyToAccount(privateKeyHex());

      const wallet = createWalletClient({
        account,
        chain: baseSepolia,
        transport: http(env.rpcUrl, { timeout: RPC_TIMEOUT_MS, retryCount: RPC_RETRY_COUNT }),
      });

      const txHash = await wallet.writeContract(request);
      return { txHash, attester: account.address };
    });
  },
};
