// rpc.ts: builds the Base Sepolia JSON-RPC transport from env.rpcUrls, with an explicit timeout per
// endpoint and a stated retry budget. With several endpoints, a down or hung one fails over to the
// next; reverts and rejected transactions do not (viem's shouldThrow), since another node agrees.

import { fallback, http, type Transport } from "viem";
import { env } from "./env.js";

// Failing over or retrying the send is safe: it re-broadcasts the same signed transaction.
export const RPC_TIMEOUT_MS = 5000;
export const RPC_RETRY_COUNT = 1;

/** One endpoint is a plain http transport; several try in order, the whole list retried once. */
export function rpcTransport(urls: readonly string[] = env.rpcUrls, timeoutMs = RPC_TIMEOUT_MS): Transport {
  if (urls.length === 0) throw new Error("rpc: no endpoint configured (RPC_URL)");
  if (urls.length === 1) return http(urls[0], { timeout: timeoutMs, retryCount: RPC_RETRY_COUNT });
  return fallback(
    urls.map((u) => http(u, { timeout: timeoutMs, retryCount: 0 })),
    { retryCount: RPC_RETRY_COUNT },
  );
}

/** Host only: providers often carry the API key in the path or query, so a URL is never printed. */
export function endpointLabel(url: string): string {
  try {
    return new URL(url).host || "invalid-endpoint";
  } catch {
    return "invalid-endpoint";
  }
}
