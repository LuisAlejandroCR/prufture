// register-schema.ts: one-off — registers the Proof-at-Capture EAS schema on Base Sepolia.
// Run once with a funded RELAYER_PRIVATE_KEY + RPC_URL, copy the printed UID into
// EAS_SCHEMA_UID in apps/api/.env (never commit it). Steps live in docs/verification.md.
// Least privilege note: this touches the SchemaRegistry, not the relayer's attest-only path.

import { createWalletClient, http, parseEventLogs, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { createPublicClient } from "viem";

// Base Sepolia SchemaRegistry (same address across Base networks).
const SCHEMA_REGISTRY = "0x4200000000000000000000000000000000000020" as const;
const SCHEMA = "bytes32 proofHash, string taskId, string geohash, uint64 capturedAt";

const REGISTRY_ABI = [
  {
    name: "register",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "schema", type: "string" },
      { name: "resolver", type: "address" },
      { name: "revocable", type: "bool" },
    ],
    outputs: [{ name: "", type: "bytes32" }],
  },
  {
    name: "Registered",
    type: "event",
    inputs: [
      { name: "uid", type: "bytes32", indexed: true },
      { name: "registerer", type: "address", indexed: true },
    ],
  },
] as const;

async function main() {
  // RPC_URL is the supported name; DWELLIR_RPC_URL stays as a deprecated fallback.
  const rpc = process.env.RPC_URL || process.env.DWELLIR_RPC_URL;
  const rawKey = process.env.RELAYER_PRIVATE_KEY;
  if (!rpc || !rawKey) {
    console.error("BLOCKED: set RPC_URL and RELAYER_PRIVATE_KEY in the environment first.");
    process.exit(1);
  }
  const pk = (rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`) as Hex;
  const account = privateKeyToAccount(pk);
  const transport = http(rpc);
  const wallet = createWalletClient({ account, chain: baseSepolia, transport });
  const pub = createPublicClient({ chain: baseSepolia, transport });

  console.log(`Registering schema as ${account.address}`);
  console.log(`  ${SCHEMA}`);
  const txHash = await wallet.writeContract({
    address: SCHEMA_REGISTRY,
    abi: REGISTRY_ABI,
    functionName: "register",
    args: [SCHEMA, "0x0000000000000000000000000000000000000000", true],
  });
  console.log(`tx: ${txHash}`);
  const receipt = await pub.waitForTransactionReceipt({ hash: txHash });
  const logs = parseEventLogs({ abi: REGISTRY_ABI, eventName: "Registered", logs: receipt.logs });
  const uid = logs[0]?.args?.uid;
  console.log(`\nEAS_SCHEMA_UID=${uid ?? "(check basescan for the Registered event)"}`);
  console.log("Copy that value into apps/api/.env — do not commit it.");
}

main().catch((e) => {
  console.error("register failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
