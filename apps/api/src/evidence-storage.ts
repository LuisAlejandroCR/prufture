// evidence-storage.ts: the storage port for sealed evidence blobs, with a "none" default (every call
// typed-unavailable) and an S3-compatible adapter (Cloudflare R2 / AWS S3) signed with SigV4 over
// plain fetch. Credentials come from env only; they never reach a result, an error or a log line.

import { createHash, createHmac } from "node:crypto";
import { guard, unavailable, type ExternalResult } from "@proof/core";
import { env } from "./env.js";

const SOURCE = "evidence-storage";
const TIMEOUT_MS = 10_000;

/** What the api needs from a blob store. Every method degrades to a typed unavailable, never throws. */
export interface EvidenceStorage {
  readonly kind: "none" | "s3";
  put(key: string, bytes: Uint8Array): Promise<ExternalResult<{ stored: true }>>;
  /** ok(null) when the object does not exist. */
  get(key: string): Promise<ExternalResult<Uint8Array | null>>;
  /** Deleting a missing object is a success (S3 semantics). */
  delete(key: string): Promise<ExternalResult<{ deleted: true }>>;
}

/** The default: evidence sharing is off, and says so in a typed way. */
export const noneStorage: EvidenceStorage = {
  kind: "none",
  put: async () => unavailable(SOURCE, "evidence storage not configured (EVIDENCE_STORAGE=none)"),
  get: async () => unavailable(SOURCE, "evidence storage not configured (EVIDENCE_STORAGE=none)"),
  delete: async () => unavailable(SOURCE, "evidence storage not configured (EVIDENCE_STORAGE=none)"),
};

export interface S3Config {
  endpoint: string;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
}

const sha256Hex = (data: Uint8Array | string) => createHash("sha256").update(data).digest("hex");
const hmac = (key: Uint8Array | string, data: string) => createHmac("sha256", key).update(data).digest();

/** RFC 3986 encoding of one path segment, as SigV4 requires. */
function encodeSegment(s: string): string {
  return encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

export interface SignInput {
  method: string;
  url: URL;
  /** Headers to sign, INCLUDING host and x-amz-date and x-amz-content-sha256. */
  headers: Record<string, string>;
  payloadHash: string;
  region: string;
  service: string;
  accessKeyId: string;
  secretAccessKey: string;
}

/**
 * AWS Signature Version 4 `Authorization` header. Exported so the known AWS test vector can pin it.
 * The path is expected to be already segment-encoded (as built by objectUrl()).
 */
export function signV4(input: SignInput): string {
  const amzDate = input.headers["x-amz-date"];
  if (!amzDate) throw new Error("x-amz-date header required");
  const date = amzDate.slice(0, 8);
  const names = Object.keys(input.headers).map((h) => h.toLowerCase()).sort();
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(input.headers)) lower[k.toLowerCase()] = v.trim().replace(/\s+/g, " ");
  const canonicalHeaders = names.map((n) => `${n}:${lower[n]}\n`).join("");
  const signedHeaders = names.join(";");
  const query = [...input.url.searchParams.entries()]
    .map(([k, v]) => [encodeSegment(k), encodeSegment(v)] as const)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  const canonicalRequest = [
    input.method,
    input.url.pathname || "/",
    query,
    canonicalHeaders,
    signedHeaders,
    input.payloadHash,
  ].join("\n");
  const scope = `${date}/${input.region}/${input.service}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256Hex(canonicalRequest)].join("\n");
  const kDate = hmac(`AWS4${input.secretAccessKey}`, date);
  const kRegion = hmac(kDate, input.region);
  const kService = hmac(kRegion, input.service);
  const kSigning = hmac(kService, "aws4_request");
  const signature = createHmac("sha256", kSigning).update(stringToSign).digest("hex");
  return `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
}

function amzNow(now: Date): string {
  return now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Path-style object URL: `${endpoint}/${bucket}/${key}` (works for R2, MinIO and S3). */
export function objectUrl(cfg: S3Config, key: string): URL {
  const base = cfg.endpoint.replace(/\/+$/, "");
  const path = [cfg.bucket, ...key.split("/")].map(encodeSegment).join("/");
  return new URL(`${base}/${path}`);
}

/** S3-compatible adapter. `fetchImpl` and `clock` are test seams. */
export function s3Storage(
  cfg: S3Config,
  fetchImpl: () => typeof fetch = () => globalThis.fetch,
  clock: () => Date = () => new Date(),
): EvidenceStorage {
  async function send(method: "PUT" | "GET" | "DELETE", key: string, body?: Uint8Array): Promise<Response> {
    const url = objectUrl(cfg, key);
    const payloadHash = sha256Hex(body ?? new Uint8Array());
    const headers: Record<string, string> = {
      host: url.host,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzNow(clock()),
    };
    if (body) headers["content-type"] = "application/octet-stream";
    const authorization = signV4({
      method,
      url,
      headers,
      payloadHash,
      region: cfg.region,
      service: "s3",
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    });
    // `host` is signed but not sent: fetch derives the identical Host header from the URL.
    const { host: _host, ...sent } = headers;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      return await fetchImpl()(url, {
        method,
        headers: { ...sent, authorization },
        body: body as RequestInit["body"],
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    kind: "s3",
    put: (key, bytes) =>
      guard(SOURCE, async () => {
        const res = await send("PUT", key, bytes);
        // Status only: an S3 error body can echo request details, so it is never read or returned.
        if (!res.ok) throw new Error(`storage PUT ${res.status}`);
        return { stored: true as const };
      }),
    get: (key) =>
      guard(SOURCE, async () => {
        const res = await send("GET", key);
        if (res.status === 404) return null;
        if (!res.ok) throw new Error(`storage GET ${res.status}`);
        return new Uint8Array(await res.arrayBuffer());
      }),
    delete: (key) =>
      guard(SOURCE, async () => {
        const res = await send("DELETE", key);
        if (!res.ok && res.status !== 404) throw new Error(`storage DELETE ${res.status}`);
        return { deleted: true as const };
      }),
  };
}

/** The adapter the env selects. An "s3" choice with any missing setting degrades to typed unavailable. */
export function evidenceStorage(): EvidenceStorage {
  if (env.evidenceStorage !== "s3") return noneStorage;
  const cfg: S3Config = {
    endpoint: env.evidenceS3Endpoint,
    bucket: env.evidenceS3Bucket,
    region: env.evidenceS3Region,
    accessKeyId: env.evidenceS3AccessKeyId,
    secretAccessKey: env.evidenceS3SecretAccessKey,
  };
  const missing = (Object.keys(cfg) as (keyof S3Config)[]).filter((k) => !cfg[k]);
  if (missing.length > 0) {
    const reason = `evidence storage misconfigured (missing ${missing.join(", ")})`;
    return {
      kind: "none",
      put: async () => unavailable(SOURCE, reason),
      get: async () => unavailable(SOURCE, reason),
      delete: async () => unavailable(SOURCE, reason),
    };
  }
  return s3Storage(cfg);
}
