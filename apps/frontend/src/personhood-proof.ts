// personhood-proof.ts: after a report is on the api, proves on the device that the reporter is an
// enrolled member of the programme group and posts it to /personhood/proof. The scope comes from the
// api (GET /personhood/scope). Pure and injectable (no react-native); every failure is "unavailable".

import type { RawSemaphoreProof } from "../modules/prufture-zk";
import type { PersonhoodProvider } from "./flags";
import type { PersonhoodSecret } from "./personhood-identity";
import { buildCircuitInputs, toSemaphoreProof } from "./personhood-inputs";

export type PersonhoodOutcome = "verified" | "invalid" | "reused" | "unavailable";

/** BN254 scalar field: a scope outside it is not one the api could have produced. */
const SNARK_FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

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
  /** 32-byte report hash as /sync accepted it (bare hex from hashBytes; 0x also tolerated). */
  proofHash: string;
  /** The signed payload's taskId; the api derives the scope from its own stored copy. */
  taskId: string;
  programmeId: string | null;
}

const OUTCOMES: readonly PersonhoodOutcome[] = ["verified", "invalid", "reused", "unavailable"];

/** Maps the api's { state } to an outcome; anything unexpected is "unavailable". */
export function toOutcome(body: unknown): PersonhoodOutcome {
  const state = (body as { state?: unknown } | null)?.state;
  return OUTCOMES.includes(state as PersonhoodOutcome) ? (state as PersonhoodOutcome) : "unavailable";
}

/** The exact scope endpoint for one report. The api is the only source of the scope. */
export function scopeUrl(apiUrl: string, programmeId: string, proofHash: string): string {
  const base = apiUrl.replace(/\/+$/, "");
  return `${base}/personhood/scope?programmeId=${encodeURIComponent(programmeId)}&proofHash=${encodeURIComponent(proofHash)}`;
}

/** { scope, epoch } from GET /personhood/scope, or null when the body is not what the api sends. */
export function parseScope(body: unknown): { scope: bigint; epoch: number } | null {
  const b = body as { scope?: unknown; epoch?: unknown } | null;
  if (typeof b?.scope !== "string" || !/^[0-9]{1,78}$/.test(b.scope)) return null;
  if (typeof b.epoch !== "number" || !Number.isInteger(b.epoch) || b.epoch < 1) return null;
  const scope = BigInt(b.scope);
  return scope < SNARK_FIELD ? { scope, epoch: b.epoch } : null;
}

// Real proof hashes are bare hex (hashBytes), which is also how /sync stores them; 0x is tolerated.
const HASH = /^(?:0x)?([0-9a-fA-F]{64})$/;

/** Never throws. Nothing is fetched, proved or read from storage unless the gate is open. */
export async function attachPersonhoodProof(req: PersonhoodRequest, deps: PersonhoodDeps): Promise<PersonhoodOutcome> {
  try {
    if (!personhoodActive(deps.provider(), deps.proverAvailable())) return "unavailable";
    const hex = HASH.exec(req.proofHash)?.[1];
    if (!req.programmeId || !hex || !req.taskId) return "unavailable";
    const base = deps.apiUrl.replace(/\/+$/, "");
    const programmeId = req.programmeId;

    // Already accepted (e.g. the answer to an earlier attempt was lost): do not prove again, which
    // would only come back "reused".
    const proofRes = await deps.fetchImpl(`${base}/proof/${encodeURIComponent(req.proofHash)}`);
    if (!proofRes.ok) return "unavailable";
    if (((await proofRes.json()) as { membership?: unknown } | null)?.membership === "verified") return "verified";

    const scopeRes = await deps.fetchImpl(scopeUrl(base, programmeId, req.proofHash));
    if (!scopeRes.ok) return "unavailable";
    const scoped = parseScope(await scopeRes.json());
    if (!scoped) return "unavailable";

    const groupRes = await deps.fetchImpl(`${base}/personhood/group/${encodeURIComponent(programmeId)}`);
    if (!groupRes.ok) return "unavailable";
    const group = (await groupRes.json()) as { epoch?: unknown; commitments?: unknown };
    // A coordinator opened a new round between the two reads: try again on a later pass.
    if (group.epoch !== scoped.epoch) return "unavailable";
    if (!Array.isArray(group.commitments) || !group.commitments.every((c) => typeof c === "string")) {
      return "unavailable";
    }

    const identity = await deps.getIdentity();
    const message = BigInt(`0x${hex}`);
    // Throws when this device is not enrolled or the group outgrew the circuit: both "unavailable".
    const { inputs } = buildCircuitInputs({
      secretScalar: identity.secretScalar,
      commitment: identity.commitment,
      commitments: group.commitments as string[],
      message,
      scope: scoped.scope,
    });
    const raw = await deps.prove(inputs);

    const res = await deps.fetchImpl(`${base}/personhood/proof`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ proofHash: req.proofHash, programmeId, proof: toSemaphoreProof(raw, message, scoped.scope) }),
    });
    if (!res.ok) return "unavailable";
    return toOutcome(await res.json());
  } catch {
    return "unavailable";
  }
}

export type Enrolment = "enrolled" | "not_enrolled" | "unknown";

/**
 * Whether this phone's pass code is on the programme list, read from the public group. Only the
 * programme id is sent. The api's "unknown programme" 404 means no one is enrolled yet; any other
 * failure is "unknown".
 */
export async function checkEnrolment(
  apiUrl: string,
  programmeId: string | null,
  commitment: string,
  fetchImpl: typeof fetch,
): Promise<Enrolment> {
  try {
    if (!programmeId || !commitment) return "unknown";
    const base = apiUrl.replace(/\/+$/, "");
    const res = await fetchImpl(`${base}/personhood/group/${encodeURIComponent(programmeId)}`);
    if (res.status === 404) {
      // Only the api's own "no group yet" answer; a 404 from a proxy or an older api says nothing.
      const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
      return body?.error === "unknown programme" ? "not_enrolled" : "unknown";
    }
    if (!res.ok) return "unknown";
    const { commitments } = (await res.json()) as { commitments?: unknown };
    if (!Array.isArray(commitments)) return "unknown";
    return commitments.includes(commitment) ? "enrolled" : "not_enrolled";
  } catch {
    return "unknown";
  }
}
