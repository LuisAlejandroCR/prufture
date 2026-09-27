// rpc-check.ts: the phase 1 endpoint suite — chain id, a fresh head, a read of the live EAS
// attestation, and a failover drill — so a candidate RPC provider is judged on evidence, not brand.
// Reports carry an endpoint's host and an error's class name only, never a URL or a vendor message.

import {
  createPublicClient,
  decodeAbiParameters,
  encodeAbiParameters,
  fallback,
  http,
  keccak256,
  parseAbiParameters,
  toHex,
  type Hex,
  type Transport,
} from "viem";
import { baseSepolia } from "viem/chains";
import { env } from "./env.js";
import { endpointLabel } from "./rpc.js";
import { sameAddress } from "./submitter.js";

/** The attestation the README cites as running today; every endpoint must read it identically. */
export const LIVE_ANCHOR = {
  uid: "0x4798879a555b6442a876a9b9a9dacfd7c3a73c3bd7fb3978f492b0fd72522905" as Hex,
  txHash: "0xee879341dbb965363bf37e1c3c8b56af8fdc732902ff3f736e6389d6b0994a9b" as Hex,
};

export const CHECK_TIMEOUT_MS = 5000;
/** Base produces a block every ~2 s; a head older than this is a stale or lagging node. */
export const MAX_HEAD_AGE_S = 120;

export const EAS_GET_ATTESTATION_ABI = [
  {
    name: "getAttestation",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "uid", type: "bytes32" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "uid", type: "bytes32" },
          { name: "schema", type: "bytes32" },
          { name: "time", type: "uint64" },
          { name: "expirationTime", type: "uint64" },
          { name: "revocationTime", type: "uint64" },
          { name: "refUID", type: "bytes32" },
          { name: "recipient", type: "address" },
          { name: "attester", type: "address" },
          { name: "revocable", type: "bool" },
          { name: "data", type: "bytes" },
        ],
      },
    ],
  },
] as const;

const SCHEMA_PARAMS = parseAbiParameters("bytes32 proofHash, string taskId, string geohash, uint64 capturedAt");

export interface CheckResult {
  name: string;
  ok: boolean;
  /** A failed optional check is reported but does not fail the endpoint. */
  required: boolean;
  detail: string;
  ms: number;
}

export interface EndpointReport {
  endpoint: string;
  checks: CheckResult[];
  passed: boolean;
  /** Hash of what the endpoint says the live attestation is; null if it could not read it. */
  fingerprint: string | null;
}

/** viem error messages embed the request URL, so only the class name is safe to report. */
function errorName(e: unknown): string {
  return e instanceof Error ? e.name : "Error";
}

async function run(
  name: string,
  required: boolean,
  op: () => Promise<string>,
): Promise<CheckResult> {
  const started = Date.now();
  try {
    const detail = await op();
    return { name, ok: true, required, detail, ms: Date.now() - started };
  } catch (e) {
    return { name, ok: false, required, detail: errorName(e), ms: Date.now() - started };
  }
}

export interface CheckOptions {
  /** Overrides the http transport; used by tests. */
  transport?: Transport;
  anchor?: typeof LIVE_ANCHOR;
  now?: () => number;
}

export async function checkEndpoint(url: string, o: CheckOptions = {}): Promise<EndpointReport> {
  const anchor = o.anchor ?? LIVE_ANCHOR;
  const now = o.now ?? Date.now;
  const client = createPublicClient({
    chain: baseSepolia,
    transport: o.transport ?? http(url, { timeout: CHECK_TIMEOUT_MS, retryCount: 0 }),
  });
  let fingerprint: string | null = null;

  const checks = [
    await run("chain-id", true, async () => {
      const id = await client.getChainId();
      if (id !== env.chainId) throw Object.assign(new Error(), { name: `WrongChain(${id})` });
      return String(id);
    }),
    await run("fresh-head", true, async () => {
      const block = await client.getBlock({ blockTag: "latest" });
      const age = Math.floor(now() / 1000) - Number(block.timestamp);
      if (age > MAX_HEAD_AGE_S) throw Object.assign(new Error(), { name: `StaleHead(${age}s)` });
      return `block ${block.number}, ${Math.max(age, 0)}s old`;
    }),
    await run("eas-read", true, async () => {
      const a = await client.readContract({
        address: env.easContract as Hex,
        abi: EAS_GET_ATTESTATION_ABI,
        functionName: "getAttestation",
        args: [anchor.uid],
      });
      if (a.uid.toLowerCase() !== anchor.uid.toLowerCase()) {
        throw Object.assign(new Error(), { name: "AttestationNotFound" });
      }
      // Re-encoding must reproduce the bytes: proof the record holds the four fields and nothing else.
      const fields = decodeAbiParameters(SCHEMA_PARAMS, a.data);
      if (encodeAbiParameters(SCHEMA_PARAMS, fields) !== a.data) {
        throw Object.assign(new Error(), { name: "UnexpectedAttestationData" });
      }
      fingerprint = keccak256(toHex(`${a.schema}|${a.attester}|${a.time}|${a.revocationTime}|${a.data}`));
      return `4 fields, attester ${a.attester}`;
    }),
    // Optional: pruned nodes drop old transaction indexes, which only matters for history lookups.
    await run("anchor-receipt", false, async () => {
      const r = await client.getTransactionReceipt({ hash: anchor.txHash });
      if (r.status !== "success" || !r.to || !sameAddress(r.to, env.easContract)) {
        throw Object.assign(new Error(), { name: "UnexpectedReceipt" });
      }
      return `block ${r.blockNumber}`;
    }),
  ];

  return {
    endpoint: endpointLabel(url),
    checks,
    passed: checks.every((c) => c.ok || !c.required),
    fingerprint,
  };
}

/** Every passing endpoint must describe the live attestation identically. */
export function endpointsAgree(reports: readonly EndpointReport[]): boolean {
  const prints = reports.filter((r) => r.passed).map((r) => r.fingerprint);
  return prints.length === reports.length && prints.every((p) => p !== null && p === prints[0]);
}

/** Longest a call may take when every endpoint in the list is dead: each tried, list retried once. */
export function failoverBudgetMs(endpoints: number, timeoutMs = CHECK_TIMEOUT_MS): number {
  return endpoints * timeoutMs * 2 + 2000;
}

/**
 * The drill: dead endpoints ahead of a live one must still answer, and a list of only dead
 * endpoints must fail within the budget instead of hanging a request.
 */
export async function failoverDrill(
  live: Transport,
  dead: readonly Transport[],
  timeoutMs = CHECK_TIMEOUT_MS,
): Promise<CheckResult[]> {
  const clientOf = (ts: readonly Transport[]) =>
    createPublicClient({ chain: baseSepolia, transport: fallback([...ts], { retryCount: 1 }) });

  const failsOver = await run("failover-to-live", true, async () => {
    const id = await clientOf([...dead, live]).getChainId();
    if (id !== env.chainId) throw Object.assign(new Error(), { name: `WrongChain(${id})` });
    return `answered past ${dead.length} dead endpoint(s)`;
  });

  const budget = failoverBudgetMs(dead.length, timeoutMs);
  const bounded = await run("all-dead-bounded", true, async () => {
    const started = Date.now();
    try {
      await clientOf(dead).getChainId();
    } catch {
      const took = Date.now() - started;
      if (took > budget) throw Object.assign(new Error(), { name: `OverBudget(${took}ms)` });
      return `failed in ${took}ms (budget ${budget}ms)`;
    }
    throw Object.assign(new Error(), { name: "DeadEndpointAnswered" });
  });

  return [failsOver, bounded];
}
