// personhood-proof.ts: after a report is on the api, proves on the device that the reporter is an
// enrolled member of the programme group and posts it to /personhood/proof. Pure and injectable (no
// react-native import); every failure returns "unavailable" and never touches saving or syncing.

import { keccak_256 } from "@noble/hashes/sha3";
import { bytesToHex } from "@noble/hashes/utils";
import type { RawSemaphoreProof } from "../modules/prufture-zk";
import type { PersonhoodProvider } from "./flags";
import type { PersonhoodSecret } from "./personhood-identity";
import { buildCircuitInputs, toSemaphoreProof } from "./personhood-inputs";

export type PersonhoodOutcome = "verified" | "invalid" | "reused" | "unavailable";

/** BN254 scalar field. Must match SNARK_FIELD in apps/api/src/personhood.ts. */
const SNARK_FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
/** Must match POLICY_VERSION in apps/api/src/personhood.ts. */
export const POLICY_VERSION = 1n;

function word(n: bigint): Uint8Array {
  const out = new Uint8Array(32);
  let v = n;
  for (let i = 31; i >= 0; i -= 1) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return out;
}

/** Solidity ABI tail for a dynamic `string`: length word, then UTF-8 bytes right-padded to 32. */
function stringTail(s: string): Uint8Array {
  const bytes = new TextEncoder().encode(s);
  const padded = new Uint8Array(Math.ceil(bytes.length / 32) * 32);
  padded.set(bytes, 0);
  const out = new Uint8Array(32 + padded.length);
  out.set(word(BigInt(bytes.length)), 0);
  out.set(padded, 32);
  return out;
}

/**
 * The api's expectedScope(): keccak256(abi.encode(string programmeId, string taskId, uint256 epoch,
 * uint256 policyVersion)) mod the SNARK field.
 * TODO: take the scope from the server once a GET /personhood/scope route exists on main; this copy
 * is pinned to the api's function by test/personhood-proof.test.ts.
 */
export function personhoodScope(programmeId: string, taskId: string, epoch: bigint, policyVersion = POLICY_VERSION): bigint {
  const a = stringTail(programmeId);
  const b = stringTail(taskId);
  const head = 4 * 32;
  const parts = [word(BigInt(head)), word(BigInt(head + a.length)), word(epoch), word(policyVersion), a, b];
  const encoded = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    encoded.set(p, at);
    at += p.length;
  }
  return BigInt(`0x${bytesToHex(keccak_256(encoded))}`) % SNARK_FIELD;
}

/** The one gate: flag set to "semaphore" AND the native prover present in this build. */
export function personhoodActive(provider: PersonhoodProvider, proverAvailable: boolean): boolean {
  return provider === "semaphore" && proverAvailable;
}

export interface PersonhoodDeps {
  fetchImpl: typeof fetch;
  apiUrl: string;
  provider: () => PersonhoodProvider;
  proverAvailable: () => boolean;
  prove: (inputs: object) => Promise<RawSemaphoreProof>;
  getIdentity: () => Promise<PersonhoodSecret>;
}

export interface PersonhoodRequest {
  /** 0x-prefixed 32-byte report hash, already accepted by /sync. */
  proofHash: string;
  /** The signed payload's taskId; the api derives the scope from its stored copy. */
  taskId: string;
  programmeId: string | null;
}

const OUTCOMES: readonly PersonhoodOutcome[] = ["verified", "invalid", "reused", "unavailable"];

/** Maps the api's { state } to an outcome; anything unexpected is "unavailable". */
export function toOutcome(body: unknown): PersonhoodOutcome {
  const state = (body as { state?: unknown } | null)?.state;
  return OUTCOMES.includes(state as PersonhoodOutcome) ? (state as PersonhoodOutcome) : "unavailable";
}

const HASH = /^0x[0-9a-fA-F]{64}$/;

/** Never throws. Nothing is fetched, proved or read from storage unless the gate is open. */
export async function attachPersonhoodProof(req: PersonhoodRequest, deps: PersonhoodDeps): Promise<PersonhoodOutcome> {
  try {
    if (!personhoodActive(deps.provider(), deps.proverAvailable())) return "unavailable";
    if (!req.programmeId || !HASH.test(req.proofHash) || !req.taskId) return "unavailable";
    const base = deps.apiUrl.replace(/\/+$/, "");
    const programmeId = req.programmeId;

    const groupRes = await deps.fetchImpl(`${base}/personhood/group/${encodeURIComponent(programmeId)}`);
    if (!groupRes.ok) return "unavailable";
    const group = (await groupRes.json()) as { epoch?: unknown; commitments?: unknown };
    if (typeof group.epoch !== "number" || !Number.isInteger(group.epoch) || group.epoch < 1) return "unavailable";
    if (!Array.isArray(group.commitments) || !group.commitments.every((c) => typeof c === "string")) {
      return "unavailable";
    }

    const identity = await deps.getIdentity();
    const message = BigInt(req.proofHash);
    const scope = personhoodScope(programmeId, req.taskId, BigInt(group.epoch));
    // Throws when this device is not enrolled or the group outgrew the circuit: both "unavailable".
    const { inputs } = buildCircuitInputs({
      secretScalar: identity.secretScalar,
      commitment: identity.commitment,
      commitments: group.commitments as string[],
      message,
      scope,
    });
    const raw = await deps.prove(inputs);

    const res = await deps.fetchImpl(`${base}/personhood/proof`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ proofHash: req.proofHash, programmeId, proof: toSemaphoreProof(raw, message, scope) }),
    });
    if (!res.ok) return "unavailable";
    return toOutcome(await res.json());
  } catch {
    return "unavailable";
  }
}
