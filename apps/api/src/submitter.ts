// submitter.ts: phase 2 of the provider portability plan — transaction submission sits behind
// an AttestationSubmitter port so key custody can be replaced without touching transaction
// policy. relayer.ts keeps the pure request builder; this module decides who signs and sends.
//
// The allowlist below is the policy, and it is enforced here rather than in an adapter so that
// EVERY present and future adapter inherits it. It fails closed: anything that is not the exact
// EAS attest() call this relayer is permitted to make throws before a key is ever touched, and
// guard() in the adapter turns that into a typed unavailable.

import type { ExternalResult, ProofPublicPayload } from "@proof/core";
import { getAddress, toFunctionSelector, type Hex } from "viem";
import { env } from "./env.js";

export interface AttestResult {
  txHash: string;
  attester: string;
}

/** What a submitter is handed: the pure, already-built EAS request plus the chain it targets. */
export interface SubmitRequest {
  address: Hex;
  abi: readonly unknown[];
  functionName: string;
  args: readonly unknown[];
  chainId: number;
}

/**
 * The port. An adapter owns key custody and transport; it owns no transaction policy, because
 * assertAllowed() has already decided what may be sent.
 */
export interface AttestationSubmitter {
  /** Stable identifier for logs and the typed result — never a credential. */
  readonly name: string;
  /** True when this adapter has everything it needs to send. */
  isConfigured(): boolean;
  submit(payload: ProofPublicPayload): Promise<ExternalResult<AttestResult>>;
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ZERO_BYTES32 = "0x0000000000000000000000000000000000000000000000000000000000000000";

/** The one selector this relayer may ever put on the wire. */
export const ATTEST_SELECTOR = toFunctionSelector(
  "attest((bytes32,(address,uint64,bool,bytes32,bytes,uint256)))",
);

function sameAddress(a: string, b: string): boolean {
  try {
    return getAddress(a) === getAddress(b);
  } catch {
    return false;
  }
}

/**
 * Fail-closed allowlist. Throws on anything outside the permitted call; the caller's guard()
 * converts that into ExternalUnavailable, so a violation degrades rather than sending.
 *
 * Checks, in order: the chain, the target contract, the function name, that the bundled ABI
 * exposes nothing but attest(), the attest() selector itself, and that no value or beneficiary
 * can ride along. The last group is what makes "the relayer moves no funds" enforceable.
 */
export function assertAllowed(req: SubmitRequest): void {
  if (req.chainId !== env.chainId) {
    throw new Error(`submitter: chain ${req.chainId} is not the allowlisted chain ${env.chainId}`);
  }
  if (!sameAddress(req.address, env.easContract)) {
    throw new Error("submitter: target is not the allowlisted EAS contract");
  }
  if (req.functionName !== "attest") {
    throw new Error(`submitter: method ${req.functionName} is not allowlisted (attest only)`);
  }

  const fns = (req.abi as { type?: string; name?: string }[])
    .filter((e) => e?.type === "function")
    .map((e) => e.name);
  if (fns.length !== 1 || fns[0] !== "attest") {
    throw new Error("submitter: ABI exposes a method other than attest()");
  }
  if (toFunctionSelector("attest((bytes32,(address,uint64,bool,bytes32,bytes,uint256)))") !== ATTEST_SELECTOR) {
    throw new Error("submitter: attest() selector mismatch");
  }

  const request = req.args[0] as
    | { schema?: unknown; data?: { recipient?: unknown; value?: unknown; expirationTime?: unknown; refUID?: unknown } }
    | undefined;
  const data = request?.data;
  if (!data) throw new Error("submitter: malformed attest request");

  if (data.value !== 0n) throw new Error("submitter: non-zero transaction value is not allowlisted");
  if (data.expirationTime !== 0n) throw new Error("submitter: expirationTime must be 0");
  if (typeof data.recipient !== "string" || !sameAddress(data.recipient, ZERO_ADDRESS)) {
    throw new Error("submitter: recipient must be the zero address");
  }
  if (data.refUID !== ZERO_BYTES32) throw new Error("submitter: refUID must be zero");
}
