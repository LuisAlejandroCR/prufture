// personhood.ts: server-side check of a Semaphore v4 group-membership proof bound to one report.
// DEFAULT OFF (PERSONHOOD_PROVIDER=semaphore enables it). Returns exactly one state; a client
// boolean is never trusted, and the nullifier never leaves this module (no return, no log).

import { verifyProof, type SemaphoreProof } from "@semaphore-protocol/proof";
import { encodeAbiParameters, keccak256 } from "viem";

export type MembershipState = "verified" | "invalid" | "reused" | "unavailable";

/** Why a check ended where it did. Fixed strings only — never proof material. */
export type MembershipReason =
  | "ok"
  | "disabled"
  | "malformed"
  | "message_mismatch"
  | "scope_mismatch"
  | "unknown_root"
  | "bad_proof"
  | "nullifier_used"
  | "verifier_error";

export interface MembershipResult {
  state: MembershipState;
  reason: MembershipReason;
}

/** BN254 scalar field; Semaphore public inputs live below it. */
export const SNARK_FIELD =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

export interface ScopeParts {
  programmeId: string;
  taskId: string;
  epoch: bigint;
  policyVersion: bigint;
}

/** One scope per (programme, task, epoch, policy): the nullifier repeats only inside it. */
export function expectedScope({ programmeId, taskId, epoch, policyVersion }: ScopeParts): bigint {
  const encoded = encodeAbiParameters(
    [{ type: "string" }, { type: "string" }, { type: "uint256" }, { type: "uint256" }],
    [programmeId, taskId, epoch, policyVersion],
  );
  return BigInt(keccak256(encoded)) % SNARK_FIELD;
}

/** Consumed nullifiers, keyed per scope. Private: never exposed on /verify, chain or logs. */
export interface NullifierStore {
  has(scope: bigint, nullifier: bigint): boolean;
  consume(scope: bigint, nullifier: bigint): void;
}

export function memoryNullifierStore(): NullifierStore {
  const used = new Set<string>();
  const key = (s: bigint, n: bigint) => `${s}:${n}`;
  return {
    has: (s, n) => used.has(key(s, n)),
    consume: (s, n) => void used.add(key(s, n)),
  };
}

export interface MembershipInput {
  /** Untrusted JSON from the app. */
  proof: unknown;
  /** The report's 0x-prefixed 32-byte hash the proof must be bound to. */
  proofHash: string;
  scope: bigint;
  /** Group roots the programme currently accepts (decimal strings). */
  acceptedRoots: Iterable<string>;
}

export interface MembershipDeps {
  nullifiers: NullifierStore;
  enabled?: () => boolean;
  verify?: (proof: SemaphoreProof) => Promise<boolean>;
}

export function personhoodEnabled(): boolean {
  return process.env.PERSONHOOD_PROVIDER?.trim() === "semaphore";
}

const NUMERIC = /^\d{1,78}$/;

function parseProof(raw: unknown): SemaphoreProof | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  const depth = p.merkleTreeDepth;
  if (typeof depth !== "number" || !Number.isInteger(depth) || depth < 1 || depth > 32) return null;
  for (const k of ["merkleTreeRoot", "message", "nullifier", "scope"] as const) {
    if (typeof p[k] !== "string" || !NUMERIC.test(p[k] as string)) return null;
  }
  const points = p.points;
  if (!Array.isArray(points) || points.length !== 8) return null;
  if (!points.every((x) => typeof x === "string" && NUMERIC.test(x))) return null;
  return {
    merkleTreeDepth: depth,
    merkleTreeRoot: p.merkleTreeRoot as `${number}`,
    message: p.message as `${number}`,
    nullifier: p.nullifier as `${number}`,
    scope: p.scope as `${number}`,
    points: points as SemaphoreProof["points"],
  };
}

function parseHash(h: string): bigint | null {
  return /^0x[0-9a-fA-F]{64}$/.test(h) ? BigInt(h) : null;
}

const result = (state: MembershipState, reason: MembershipReason): MembershipResult => ({ state, reason });

/**
 * snarkjs caches the BN254 curve (with worker threads) on globalThis after the first verify and
 * reuses it; that is what a long-lived server wants. Call this on shutdown or at the end of tests,
 * otherwise the workers keep the process alive.
 */
export async function closePersonhoodVerifier(): Promise<void> {
  const g = globalThis as { curve_bn128?: { terminate?: () => Promise<void> } | null };
  await g.curve_bn128?.terminate?.();
  g.curve_bn128 = null;
}

/**
 * Cheap checks first (shape, binding, scope, root, nullifier), then the Groth16 verify; the
 * nullifier is consumed only after everything passes, so a rejected proof never burns it.
 */
export async function verifyMembership(
  input: MembershipInput,
  { nullifiers, enabled = personhoodEnabled, verify = verifyProof }: MembershipDeps,
): Promise<MembershipResult> {
  if (!enabled()) return result("unavailable", "disabled");

  const proof = parseProof(input.proof);
  const hash = parseHash(input.proofHash);
  if (!proof || hash === null) return result("invalid", "malformed");

  // Semaphore hashes message and scope internally, so the raw values are compared (spike §1).
  if (BigInt(proof.message) !== hash) return result("invalid", "message_mismatch");
  if (BigInt(proof.scope) !== input.scope) return result("invalid", "scope_mismatch");
  if (!new Set(input.acceptedRoots).has(proof.merkleTreeRoot)) return result("invalid", "unknown_root");

  const nullifier = BigInt(proof.nullifier);
  if (nullifiers.has(input.scope, nullifier)) return result("reused", "nullifier_used");

  let valid: boolean;
  try {
    valid = (await verify(proof)) === true;
  } catch {
    return result("unavailable", "verifier_error");
  }
  if (!valid) return result("invalid", "bad_proof");

  // Re-check after the await: two concurrent submissions of one nullifier must not both pass.
  if (nullifiers.has(input.scope, nullifier)) return result("reused", "nullifier_used");
  nullifiers.consume(input.scope, nullifier);
  return result("verified", "ok");
}
