// none.ts: the explicit "do not submit" adapter. Selecting ATTESTATION_SUBMITTER=none turns the
// on-chain step off deliberately rather than by leaving credentials blank, which is what lets a
// deployment prove it is not anchoring. /sync still returns 200 with status "synced".

import { unavailable, type ExternalResult, type ProofPublicPayload } from "@proof/core";
import type { AttestResult, AttestationSubmitter } from "../submitter.js";

export const noneSubmitter: AttestationSubmitter = {
  name: "none",
  isConfigured(): boolean {
    return false;
  },
  async submit(_payload: ProofPublicPayload): Promise<ExternalResult<AttestResult>> {
    return unavailable("relayer/eas", "attestation submitter disabled (ATTESTATION_SUBMITTER=none)");
  },
};
