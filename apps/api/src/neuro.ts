// neuro.ts: minimal Neuro Agent API client for one verified attribute (e.g. age majority).
// Zero-PII boundary: only { attribute, value:boolean } plus source/checkedAt may leave this
// module. The token, request body, and raw response identity fields never get logged or returned.
// Degrades via guard()/unavailable() — never throws the caller (same contract as relayer.ts).

import { guard, unavailable, type ExternalResult } from "@proof/core";
import { env } from "./env.js";

export interface VerifiedAttribute {
  /** Opaque attribute name, e.g. "age_majority". Not a PII field. */
  attribute: string;
  /** The verified boolean. The only identity-derived value allowed out of this module. */
  value: boolean;
}

export interface VerifiedAttributeInput {
  /** Which attribute to check. Defaults to "age_majority". */
  attribute?: string;
  /** Opaque handle the caller already holds (session id / claim ref). Never a raw PII value. */
  subjectRef?: string;
}

const DEFAULT_ATTRIBUTE = "age_majority";
const TIMEOUT_MS = 5000;

/**
 * Ask the Neuro Agent API whether `attribute` holds for the referenced subject.
 * - Missing NEURO_AGENT_API_URL or NEURO_AGENT_API_TOKEN => typed unavailable, no throw.
 * - Configured => POST behind guard() with a 5s timeout; any failure => typed unavailable.
 * The returned ExternalOk.data is exactly { attribute, value } — nothing from the raw body.
 */
export async function getVerifiedAttribute(
  input: VerifiedAttributeInput = {},
): Promise<ExternalResult<VerifiedAttribute>> {
  if (!env.neuroUrl || !env.neuroToken) {
    return unavailable("neuro", "neuro not configured (NEURO_AGENT_API_URL / NEURO_AGENT_API_TOKEN missing)");
  }

  const attribute = input.attribute ?? DEFAULT_ATTRIBUTE;

  return guard("neuro", async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${env.neuroUrl.replace(/\/$/, "")}/verify-attribute`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${env.neuroToken}`,
        },
        body: JSON.stringify({ attribute, subjectRef: input.subjectRef }),
        signal: controller.signal,
      });

      // Parse defensively. We read exactly one field and coerce it to a boolean.
      // Nothing else from `body` is referenced, so no identity field can transit.
      const body = (await res.json().catch(() => ({}))) as { verified?: unknown; value?: unknown };
      if (!res.ok) {
        // Do not echo the response body — it may carry identity context.
        throw new Error(`neuro ${res.status}`);
      }

      const raw = body.verified ?? body.value;
      const value = raw === true || raw === "true";
      return { attribute, value };
    } finally {
      clearTimeout(timer);
    }
  });
}

export interface LivenessInput {
  /** Small base64 frames from the selfie challenge. Sent once, never logged or stored. */
  frames: string[];
  /** 16-byte hex nonce that tied the frames to one attempt. */
  nonceHex: string;
  /** The gesture sequence the reporter was asked to perform. */
  challenges: string[];
}

/**
 * Ask Neuro whether the selfie frames show a live person.
 * - Missing NEURO_AGENT_API_URL / NEURO_AGENT_API_TOKEN => typed unavailable, no throw.
 * - Configured => POST behind guard() + 5s timeout. EXACTLY one boolean field is read
 *   (`live` | `verified` | `passed`) and coerced. No score, session id, frame, or any
 *   other field is read, returned, or logged. The request body is never logged.
 * The returned ExternalOk.data is exactly { verifiedPerson }.
 */
export async function checkLiveness(
  input: LivenessInput,
): Promise<ExternalResult<{ verifiedPerson: boolean }>> {
  if (!env.neuroUrl || !env.neuroToken) {
    return unavailable("neuro", "neuro not configured (NEURO_AGENT_API_URL / NEURO_AGENT_API_TOKEN missing)");
  }

  return guard("neuro", async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const url = `${env.neuroUrl.replace(/\/$/, "")}${env.neuroLivenessPath}`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${env.neuroToken}`,
        },
        body: JSON.stringify({
          frames: input.frames,
          nonce: input.nonceHex,
          challenges: input.challenges,
        }),
        signal: controller.signal,
      });

      // Read one boolean, coerce, ignore everything else. Do not echo the body.
      const body = (await res.json().catch(() => ({}))) as {
        live?: unknown;
        verified?: unknown;
        passed?: unknown;
      };
      if (!res.ok) throw new Error(`neuro ${res.status}`);

      const raw = body.live ?? body.verified ?? body.passed;
      return { verifiedPerson: raw === true || raw === "true" };
    } finally {
      clearTimeout(timer);
    }
  });
}
