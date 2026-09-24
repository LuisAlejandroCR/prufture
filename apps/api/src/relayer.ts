// relayer.ts: submits an EAS attestation on Base Sepolia over a configured RPC endpoint, paying
// gas. The endpoint is vendor-neutral (env.rpcUrl) — any provider serving the chain works.
// Least privilege: this key may only call attest(). It never moves user funds — no
// transfer, sendTransaction-with-value, approve, or contract call other than attest().
// guard() ensures any failure becomes ExternalUnavailable and never throws the user flow.

import { guard, type ExternalResult, type ProofPublicPayload } from "@proof/core";
import {
  createWalletClient,
  encodeAbiParameters,
  http,
  parseAbiParameters,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { env, relayerConfigured } from "./env.js";

export interface AttestResult {
  txHash: string;
  attester: string;
}

// EAS core contract: the only method the relayer is ever allowed to call.
const EAS_ATTEST_ABI = [
  {
    name: "attest",
    type: "function",
    stateMutability: "payable",
    inputs: [
      {
        name: "request",
        type: "tuple",
        components: [
          { name: "schema", type: "bytes32" },
          {
            name: "data",
            type: "tuple",
            components: [
              { name: "recipient", type: "address" },
              { name: "expirationTime", type: "uint64" },
              { name: "revocable", type: "bool" },
              { name: "refUID", type: "bytes32" },
              { name: "data", type: "bytes" },
              { name: "value", type: "uint256" },
            ],
          },
        ],
      },
    ],
    outputs: [{ name: "", type: "bytes32" }],
  },
] as const;

// Schema registered on Base Sepolia (see docs/verification.md):
// proofHash bytes32, taskId string, geohash string, capturedAt uint64
const SCHEMA_PARAMS = parseAbiParameters(
  "bytes32 proofHash, string taskId, string geohash, uint64 capturedAt",
);

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;
const ZERO_BYTES32 = "0x0000000000000000000000000000000000000000000000000000000000000000" as const;

function to0xHash(proofHash: string): Hex {
  const hex = proofHash.startsWith("0x") ? proofHash.slice(2) : proofHash;
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error("proofHash must be 32 bytes of hex (sha256)");
  }
  return `0x${hex.toLowerCase()}` as Hex;
}

function capturedAtSeconds(capturedAt: string): bigint {
  const ms = Date.parse(capturedAt);
  if (Number.isNaN(ms)) throw new Error("capturedAt is not a valid ISO-8601 timestamp");
  return BigInt(Math.floor(ms / 1000));
}

/** Encode the proof into the EAS schema's ABI layout. Zero-PII: only public payload fields. */
export function encodeProofData(payload: ProofPublicPayload): Hex {
  return encodeAbiParameters(SCHEMA_PARAMS, [
    to0xHash(payload.proofHash),
    payload.taskId,
    payload.geohash,
    capturedAtSeconds(payload.capturedAt),
  ]);
}

/**
 * Pure builder for the one contract call this relayer is allowed to make.
 * Least-privilege invariant: it always targets env.easContract, always calls
 * `attest`, always sends recipient=0x0 / value=0 / refUID=0x0 — no funds move,
 * no other method is reachable. Tests assert these without touching the chain.
 */
export function buildAttestRequest(payload: ProofPublicPayload) {
  return {
    address: env.easContract as Hex,
    abi: EAS_ATTEST_ABI,
    functionName: "attest" as const,
    args: [
      {
        schema: env.easSchemaUid as Hex,
        data: {
          recipient: ZERO_ADDRESS,
          expirationTime: 0n,
          revocable: true,
          refUID: ZERO_BYTES32,
          data: encodeProofData(payload),
          value: 0n,
        },
      },
    ] as const,
  };
}

export async function submitAttestation(
  payload: ProofPublicPayload,
): Promise<ExternalResult<AttestResult>> {
  if (!relayerConfigured()) {
    return {
      available: false,
      source: "relayer/eas",
      checkedAt: new Date().toISOString(),
      data: null,
      error: "relayer not configured (RPC_URL / RELAYER_PRIVATE_KEY / EAS_SCHEMA_UID missing)",
    };
  }

  return guard("relayer/eas", async () => {
    const pk = env.relayerPrivateKey.startsWith("0x")
      ? (env.relayerPrivateKey as Hex)
      : (`0x${env.relayerPrivateKey}` as Hex);
    const account = privateKeyToAccount(pk);

    const wallet = createWalletClient({
      account,
      chain: baseSepolia,
      transport: http(env.rpcUrl),
    });

    const txHash = await wallet.writeContract(buildAttestRequest(payload));

    return { txHash, attester: account.address };
  });
}
