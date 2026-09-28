// local-key.ts: the default AttestationSubmitter — RELAYER_PRIVATE_KEY signs attest() and the tx goes
// out over rpc.ts. It owns key custody and transport only; assertAllowed() owns policy. Key material
// never leaves this module, not in the result and not in an error message.

import { guard, type ExternalResult, type ProofPublicPayload } from "@proof/core";
import { createWalletClient, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { env, relayerConfigured } from "../env.js";
import { buildAttestRequest } from "../relayer-request.js";
import { rpcTransport } from "../rpc.js";
import { assertAllowed, publicError, type AttestResult, type AttestationSubmitter } from "../submitter.js";

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

  // Derived locally: nothing is signed or sent.
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
      // Policy first: no key is derived unless the call is allowlisted.
      assertAllowed({ ...request, chainId: baseSepolia.id });

      const account = privateKeyToAccount(privateKeyHex());

      const wallet = createWalletClient({
        account,
        chain: baseSepolia,
        transport: rpcTransport(),
      });

      try {
        const txHash = await wallet.writeContract(request);
        return { txHash, attester: account.address };
      } catch (e) {
        // viem's message embeds the RPC URL (often holding the provider key) and the full call.
        throw new Error(`rpc: ${publicError(e)}`);
      }
    });
  },
};
