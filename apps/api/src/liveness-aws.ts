// liveness-aws.ts: the "aws" liveness adapter (Rekognition Face Liveness), selected by
// LIVENESS_PROVIDER=aws. Creates a session for the iOS capture view and reduces its result to one
// boolean; confidence, reference/audit images and the raw response never leave this file.

import { ok, unavailable, type ExternalResult } from "@proof/core";
import type { LivenessPort, LivenessSessionPort, LivenessVerdict } from "./assurance.js";

/**
 * The two Rekognition calls this adapter makes, narrowed so tests can stub them. The real one
 * passes the SDK response through untouched; the adapter reads only Status and Confidence from it.
 */
export interface FaceLivenessClient {
  createSession(): Promise<{ SessionId?: string }>;
  getResults(sessionId: string): Promise<{ Status?: string; Confidence?: number }>;
}

export const DEFAULT_MIN_CONFIDENCE = 90;
// Rekognition session ids are UUIDs. Anything else is refused before it reaches AWS.
const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isSessionId(v: unknown): v is string {
  return typeof v === "string" && SESSION_ID.test(v);
}

/** LIVENESS_MIN_CONFIDENCE, 0..100. Anything unparseable or out of range falls back to 90. */
export function minConfidence(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.LIVENESS_MIN_CONFIDENCE?.trim();
  if (!raw) return DEFAULT_MIN_CONFIDENCE;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : DEFAULT_MIN_CONFIDENCE;
}

/**
 * Region plus some credential source the SDK's default chain can resolve. This is a presence
 * check, not a validity check: a bad key still degrades typed, at call time, through runThrough.
 */
export function awsConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  const region = (env.AWS_REGION ?? "").trim();
  if (!region) return false;
  const keys = !!env.AWS_ACCESS_KEY_ID?.trim() && !!env.AWS_SECRET_ACCESS_KEY?.trim();
  const profile = !!env.AWS_PROFILE?.trim();
  const webIdentity = !!env.AWS_WEB_IDENTITY_TOKEN_FILE?.trim() && !!env.AWS_ROLE_ARN?.trim();
  const container = !!env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI?.trim() || !!env.AWS_CONTAINER_CREDENTIALS_FULL_URI?.trim();
  return keys || profile || webIdentity || container;
}

/** The real client. The SDK is loaded on first use, so LIVENESS_PROVIDER=none never loads it. */
export function rekognitionClient(region: string): FaceLivenessClient {
  let client: Promise<{ sdk: typeof import("@aws-sdk/client-rekognition"); rk: import("@aws-sdk/client-rekognition").RekognitionClient }> | null = null;
  const load = () =>
    (client ??= import("@aws-sdk/client-rekognition").then((sdk) => ({ sdk, rk: new sdk.RekognitionClient({ region }) })));
  return {
    async createSession() {
      const { sdk, rk } = await load();
      // No OutputConfig: nothing is written to S3. AuditImagesLimit 0: AWS returns no audit images.
      return rk.send(new sdk.CreateFaceLivenessSessionCommand({ Settings: { AuditImagesLimit: 0 } }));
    },
    async getResults(sessionId) {
      const { sdk, rk } = await load();
      return rk.send(new sdk.GetFaceLivenessSessionResultsCommand({ SessionId: sessionId }));
    },
  };
}

export interface AwsLivenessOptions {
  env?: NodeJS.ProcessEnv;
  /** Injected in tests. Default: the real Rekognition client for AWS_REGION. */
  client?: FaceLivenessClient;
}

export type AwsLiveness = LivenessPort & LivenessSessionPort;

export function createAwsLiveness(opts: AwsLivenessOptions = {}): AwsLiveness {
  const env = () => opts.env ?? process.env;
  let real: FaceLivenessClient | null = null;
  const client = () => opts.client ?? (real ??= rekognitionClient((env().AWS_REGION ?? "").trim()));

  return {
    name: "aws",
    isConfigured: () => awsConfigured(env()),

    // The frames-mode /verify-identity does not apply: AWS runs its own capture on the device.
    async check(): Promise<ExternalResult<LivenessVerdict>> {
      return unavailable("liveness", "aws uses the session flow (/liveness/session)");
    },

    async createSession(): Promise<ExternalResult<{ sessionId: string }>> {
      const r = await client().createSession();
      const sessionId = r?.SessionId;
      if (!isSessionId(sessionId)) return unavailable("liveness", "aws returned no session id");
      return ok("liveness", { sessionId });
    },

    async sessionResult(sessionId: string): Promise<ExternalResult<LivenessVerdict>> {
      const r = await client().getResults(sessionId);
      // Read two fields and drop the response: the images and the raw object go no further.
      const status = r?.Status;
      const confidence = r?.Confidence;
      const verifiedPerson =
        status === "SUCCEEDED" && typeof confidence === "number" && Number.isFinite(confidence) && confidence >= minConfidence(env());
      return ok("liveness", { verifiedPerson });
    },
  };
}

export const awsLiveness: AwsLiveness = createAwsLiveness();
