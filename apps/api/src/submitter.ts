// submitter.ts: the AttestationSubmitter port — adapters own key custody and transport, never policy.
// assertAllowed() is the fail-closed allowlist every adapter inherits: anything but the exact EAS
// attest() call throws before a key is touched, and the adapter's guard() makes that a typed unavailable.

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
  /** Names the settings isConfigured() needs, for the "not configured" message. Never a value. */
  readonly configHint?: string;
  /**
   * The address this adapter attests from, when it can say so without sending anything. Used to
   * skip a submission this adapter already made. Optional: an adapter that cannot tell is treated
   * as having attested any proof that already carries an attestation, so it never pays twice.
   */
  attester?(): string | null;
  submit(payload: ProofPublicPayload): Promise<ExternalResult<AttestResult>>;
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ZERO_BYTES32 = "0x0000000000000000000000000000000000000000000000000000000000000000";

/** The one selector this relayer may ever put on the wire. */
export const ATTEST_SELECTOR = toFunctionSelector(
  "attest((bytes32,(address,uint64,bool,bytes32,bytes,uint256)))",
);

interface AbiFunctionLike {
  type?: string;
  name?: string;
}

function isHex32(v: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(v);
}

export function sameAddress(a: string, b: string): boolean {
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
 * exposes nothing but attest(), that the ABI's attest() has exactly the allowlisted SIGNATURE
 * (derived as a selector, so a same-named function with different parameters is refused), the
 * schema UID, and that no value or beneficiary can ride along. The last two are what make
 * "exactly four fields, and the relayer moves no funds" enforceable.
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
  // Derive the selector from the ABI THAT WILL BE USED, not from the constant. Comparing the
  // constant to itself proved nothing: a function still called "attest" but taking different
  // parameters encodes to a different selector and would otherwise pass every check above.
  const attestEntry = (req.abi as AbiFunctionLike[]).find((e) => e?.type === "function" && e.name === "attest");
  let selector: string;
  try {
    selector = toFunctionSelector(attestEntry as never);
  } catch {
    throw new Error("submitter: attest() entry is not a usable ABI function");
  }
  if (selector !== ATTEST_SELECTOR) {
    throw new Error("submitter: attest() signature is not the allowlisted one");
  }

  const request = req.args[0] as
    | { schema?: unknown; data?: { recipient?: unknown; value?: unknown; expirationTime?: unknown; refUID?: unknown } }
    | undefined;
  const data = request?.data;
  if (!data) throw new Error("submitter: malformed attest request");

  // The schema UID decides what structure gets written on chain. Without this check an adapter
  // could attest arbitrary data under this relayer's key while passing every other rule, which
  // would break the "exactly proofHash / taskId / geohash / capturedAt" guarantee.
  if (!isHex32(env.easSchemaUid)) {
    throw new Error("submitter: no allowlisted EAS schema is configured");
  }
  if (typeof request?.schema !== "string" || request.schema.toLowerCase() !== env.easSchemaUid.toLowerCase()) {
    throw new Error("submitter: schema is not the allowlisted EAS schema");
  }

  if (data.value !== 0n) throw new Error("submitter: non-zero transaction value is not allowlisted");
  if (data.expirationTime !== 0n) throw new Error("submitter: expirationTime must be 0");
  if (typeof data.recipient !== "string" || !sameAddress(data.recipient, ZERO_ADDRESS)) {
    throw new Error("submitter: recipient must be the zero address");
  }
  if (data.refUID !== ZERO_BYTES32) throw new Error("submitter: refUID must be zero");
}
