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

export const localKeySubmitter: AttestationSubmitter = {
  name: "local-key",

  isConfigured(): boolean {
    return relayerConfigured();
  },

  async submit(payload: ProofPublicPayload): Promise<ExternalResult<AttestResult>> {
    return guard("relayer/eas", async () => {
      const request = buildAttestRequest(payload);

      // Policy first: nothing below runs — and no key is derived — unless the call is allowlisted.
      assertAllowed({ ...request, chainId: baseSepolia.id });

      const pk = env.relayerPrivateKey.startsWith("0x")
        ? (env.relayerPrivateKey as Hex)
        : (`0x${env.relayerPrivateKey}` as Hex);
      const account = privateKeyToAccount(pk);

      const wallet = createWalletClient({
        account,
        chain: baseSepolia,
        transport: http(env.rpcUrl),
      });

      const txHash = await wallet.writeContract(request);
      return { txHash, attester: account.address };
    });
  },
};
