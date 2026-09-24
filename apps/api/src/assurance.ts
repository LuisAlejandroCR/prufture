// assurance.ts: phase 3 of the provider portability plan. "Neuro" was one vendor bolted onto two
// unrelated jobs — proving a live person is present, and proving one attribute about someone.
// They have different vendors, different consent, and different risk, so they get separate ports.
//
// BOTH DEFAULT OFF. Assurance is optional by design: the plan keeps it disabled until a pilot
// states why it is needed, and an unknown provider name fails closed to `none` rather than
// silently enabling a vendor. Nothing here may block offline capture: every path returns a typed
// ExternalResult and the caller degrades.
//
// The minimal-verdict rule is enforced at this boundary: a LivenessPort may only ever yield
// { verifiedPerson: boolean } and an AttributePort only { attribute, value: boolean }. No score,
// no session id, no frame, no claim, no raw vendor response passes through.

import type { ExternalResult } from "@proof/core";
import { env } from "./env.js";
import { unavailable } from "@proof/core";
import { checkLiveness, getVerifiedAttribute, type LivenessInput, type VerifiedAttribute, type VerifiedAttributeInput } from "./neuro.js";

export type { LivenessInput, VerifiedAttribute, VerifiedAttributeInput };

/** The only shape a liveness provider may return. */
export interface LivenessVerdict {
  verifiedPerson: boolean;
}

export interface LivenessPort {
  /** Stable identifier for the typed result — never a credential. */
  readonly name: string;
  isConfigured(): boolean;
  check(input: LivenessInput): Promise<ExternalResult<LivenessVerdict>>;
}

export interface AttributePort {
  readonly name: string;
  isConfigured(): boolean;
  get(input: VerifiedAttributeInput): Promise<ExternalResult<VerifiedAttribute>>;
}

const OFF_LIVENESS = "liveness disabled (LIVENESS_PROVIDER=none)";
const OFF_ATTRIBUTE = "verified attributes disabled (ATTRIBUTE_PROVIDER=none)";

export const noneLiveness: LivenessPort = {
  name: "none",
  isConfigured: () => false,
  async check(): Promise<ExternalResult<LivenessVerdict>> {
    return unavailable("liveness", OFF_LIVENESS);
  },
};

export const noneAttribute: AttributePort = {
  name: "none",
  isConfigured: () => false,
  async get(): Promise<ExternalResult<VerifiedAttribute>> {
    return unavailable("attribute", OFF_ATTRIBUTE);
  },
};

/**
 * The current vendor, unchanged, now addressed through the port. neuro.ts still owns the wire
 * format and its own zero-PII guarantees; this adapter only re-narrows the result to the port's
 * verdict shape so a swap cannot widen what callers see.
 */
export const neuroLiveness: LivenessPort = {
  name: "neuro",
  isConfigured: () => neuroConfigured(),
  async check(input: LivenessInput): Promise<ExternalResult<LivenessVerdict>> {
    const r = await checkLiveness(input);
    if (!r.available) return r;
    // Re-narrow: exactly one boolean survives, whatever the adapter handed back.
    return { ...r, data: { verifiedPerson: r.data.verifiedPerson === true } };
  },
};

export const neuroAttribute: AttributePort = {
  name: "neuro",
  isConfigured: () => neuroConfigured(),
  async get(input: VerifiedAttributeInput): Promise<ExternalResult<VerifiedAttribute>> {
    const r = await getVerifiedAttribute(input);
    if (!r.available) return r;
    return { ...r, data: { attribute: r.data.attribute, value: r.data.value === true } };
  },
};

function neuroConfigured(): boolean {
  // Read the SAME source neuro.ts reads, so "configured" here can never disagree with whether
  // the adapter will actually call out. (env.neuroUrl/neuroToken are snapshot at module load.)
  return Boolean(env.neuroUrl && env.neuroToken);
}

const LIVENESS_PORTS: Record<string, LivenessPort> = { none: noneLiveness, neuro: neuroLiveness };
const ATTRIBUTE_PORTS: Record<string, AttributePort> = { none: noneAttribute, neuro: neuroAttribute };

/** Default OFF. An unknown name resolves to `none` — it never enables a vendor by accident. */
export function selectedLivenessPort(): LivenessPort {
  const name = process.env.LIVENESS_PROVIDER?.trim() || "none";
  return LIVENESS_PORTS[name] ?? noneLiveness;
}

export function selectedAttributePort(): AttributePort {
  const name = process.env.ATTRIBUTE_PROVIDER?.trim() || "none";
  return ATTRIBUTE_PORTS[name] ?? noneAttribute;
}

/**
 * What the API calls. Selection, the off switch, and the unconfigured case all collapse into the
 * same typed unavailable, so a caller can never tell a disabled provider from a broken one in a
 * way that would change the reporter's flow — it degrades either way.
 */
export async function checkLivenessVerdict(input: LivenessInput): Promise<ExternalResult<LivenessVerdict>> {
  const port = selectedLivenessPort();
  if (!port.isConfigured()) return unavailable("liveness", port.name === "none" ? OFF_LIVENESS : `${port.name} not configured`);
  return port.check(input);
}

export async function fetchVerifiedAttribute(input: VerifiedAttributeInput): Promise<ExternalResult<VerifiedAttribute>> {
  const port = selectedAttributePort();
  if (!port.isConfigured()) return unavailable("attribute", port.name === "none" ? OFF_ATTRIBUTE : `${port.name} not configured`);
  return port.get(input);
}
