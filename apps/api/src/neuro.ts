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
