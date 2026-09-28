// assurance.ts: the liveness port, DEFAULT OFF with only a `none` adapter until a pilot names a need;
// any provider name resolves to `none`. Minimal-verdict rule enforced here: only { verifiedPerson }
// passes — no score, session, frame or raw vendor response — and nothing can block offline capture.

import { guard, unavailable, type ExternalResult } from "@proof/core";

export interface LivenessInput {
  /** Small base64 frames from the selfie challenge. Sent once, never logged or stored. */
  frames: string[];
  /** 16-byte hex nonce that tied the frames to one attempt. */
  nonceHex: string;
  /** The gesture sequence the reporter was asked to perform. */
  challenges: string[];
}

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

const OFF_LIVENESS = "liveness disabled (LIVENESS_PROVIDER=none)";

export const noneLiveness: LivenessPort = {
  name: "none",
  isConfigured: () => false,
  async check(): Promise<ExternalResult<LivenessVerdict>> {
    return unavailable("liveness", OFF_LIVENESS);
  },
};

const LIVENESS_PORTS: Record<string, LivenessPort> = { none: noneLiveness };

/** Default OFF. An unknown name resolves to `none` — it never enables a vendor by accident. */
export function selectedLivenessPort(): LivenessPort {
  const name = process.env.LIVENESS_PROVIDER?.trim() || "none";
  return LIVENESS_PORTS[name] ?? noneLiveness;
}

/**
 * What the API calls. The off switch and an unconfigured adapter collapse into the same typed
 * unavailable, so the reporter's flow degrades the same way whichever it is.
 */
export async function checkLivenessVerdict(
  input: LivenessInput,
  port: LivenessPort = selectedLivenessPort(),
): Promise<ExternalResult<LivenessVerdict>> {
  if (!isConfiguredSafely(port)) {
    return unavailable("liveness", port.name === "none" ? OFF_LIVENESS : `${port.name} not configured`);
  }
  const r = await runThrough("liveness", port.name, () => port.check(input));
  // Re-narrow: exactly one boolean survives, whatever the adapter handed back.
  return r.available ? { ...r, data: { verifiedPerson: r.data.verifiedPerson === true } } : r;
}

/** An adapter's isConfigured() is adapter code: a throw from it means "not configured". */
function isConfiguredSafely(port: { isConfigured(): boolean }): boolean {
  try {
    return port.isConfigured() === true;
  } catch {
    return false;
  }
}

/**
 * Makes the port's typed contract structural: a throwing or non-conforming adapter degrades to a
 * typed unavailable instead of breaking the reporter's flow.
 */
export async function runThrough<T>(
  source: string,
  name: string,
  call: () => Promise<ExternalResult<T>>,
): Promise<ExternalResult<T>> {
  const wrapped = await guard(source, async () => {
    const r = await call();
    if (!r || typeof r.available !== "boolean") {
      throw new Error(`${name} adapter returned a non-conforming result`);
    }
    return r;
  });
  return wrapped.available ? wrapped.data : wrapped;
}
