// env.ts: config from process.env. A missing value degrades a feature, never crashes the server.
// Every field is a live getter, so a "configured" check always agrees with what the call will do,
// and a deploy or a test can change any value without re-importing.

export const env = {
  get port(): number {
    return Number(process.env.PORT ?? 8787);
  },

  // Vendor-neutral Base Sepolia endpoint. DWELLIR_RPC_URL is a deprecated fallback name, kept so
  // an existing deployment survives the rename.
  get rpcUrl(): string {
    return process.env.RPC_URL || process.env.DWELLIR_RPC_URL || "";
  },
  /** Endpoints in the order they are tried: rpcUrl, then RPC_FALLBACK_URLS (comma-separated). */
  get rpcUrls(): string[] {
    const all = [this.rpcUrl, ...(process.env.RPC_FALLBACK_URLS ?? "").split(",")];
    return [...new Set(all.map((u) => u.trim()).filter(Boolean))];
  },
  /** True when the endpoint came only from the deprecated DWELLIR_RPC_URL name. */
  get rpcUrlIsLegacy(): boolean {
    return !process.env.RPC_URL && Boolean(process.env.DWELLIR_RPC_URL);
  },
  get relayerPrivateKey(): string {
    return process.env.RELAYER_PRIVATE_KEY ?? "";
  },
  get easContract(): string {
    return process.env.EAS_CONTRACT_ADDRESS ?? "0x4200000000000000000000000000000000000021";
  },
  get easSchemaUid(): string {
    return process.env.EAS_SCHEMA_UID ?? "";
  },
  get chainId(): number {
    return Number(process.env.BASE_SEPOLIA_CHAIN_ID ?? 84532);
  },

  // OpenZeppelin Relayer adapter: the relayer holds the key. OZ_RELAYER_ADDRESS pins its signer;
  // a relayer reporting any other address is refused.
  get ozRelayerUrl(): string {
    return process.env.OZ_RELAYER_URL ?? "";
  },
  get ozRelayerId(): string {
    return process.env.OZ_RELAYER_ID ?? "";
  },
  get ozRelayerApiKey(): string {
    return process.env.OZ_RELAYER_API_KEY ?? "";
  },
  get ozRelayerAddress(): string {
    return process.env.OZ_RELAYER_ADDRESS ?? "";
  },
  /** OZ's name for Base Sepolia. */
  get ozRelayerNetwork(): string {
    return process.env.OZ_RELAYER_NETWORK || "base-sepolia";
  },

  // Auto-notify sends the public verifyUrl to the fixed PROGRAMME recipients, never the reporter.
  // Off unless enabled; no phone or email is ever stored against a reporter.
  get notifyEnabled(): boolean {
    return process.env.NOTIFY_ENABLED === "true";
  },
  get notifyOn(): "sync" | "attest" | "both" {
    return (process.env.NOTIFY_ON ?? "sync") as "sync" | "attest" | "both";
  },
  get programmeWhatsapp(): string {
    return process.env.PROGRAMME_WHATSAPP ?? "";
  },
  get programmeEmail(): string {
    return process.env.PROGRAMME_EMAIL ?? "";
  },
  get programmeTelegramChat(): string {
    return process.env.PROGRAMME_TELEGRAM_CHAT_ID ?? "";
  },

  // /liveness-result and /precise-location refuse a write without the proof's evidence token. Off
  // until every build in the field sends the token; a wrong token is refused either way.
  get requireEvidenceToken(): boolean {
    return process.env.REQUIRE_EVIDENCE_TOKEN === "true";
  },

  // RevenueCat entitlement check: the secret key never reaches the client.
  get revenuecatSecretKey(): string {
    return process.env.REVENUECAT_SECRET_KEY ?? "";
  },
  get revenuecatApiBase(): string {
    return process.env.REVENUECAT_API_BASE ?? "https://api.revenuecat.com/v2";
  },
  // v2 endpoints are project-scoped; without this the check degrades typed.
  get revenuecatProjectId(): string {
    return process.env.REVENUECAT_PROJECT_ID ?? "";
  },
  // The coordinator_pro entitlement's internal id (entl...), which is what v2 active_entitlements
  // returns. The lookup key "coordinator_pro" never appears there.
  get revenuecatCoordinatorEntitlementId(): string {
    return process.env.REVENUECAT_COORDINATOR_ENTITLEMENT_ID?.trim() ?? "";
  },

  // Sealed evidence photos (opt-in or coordinator-requested, reporter-approved). The api only ever
  // holds opaque ciphertext. "none" (default) keeps every evidence route typed-unavailable.
  get evidenceStorage(): "none" | "s3" {
    return process.env.EVIDENCE_STORAGE === "s3" ? "s3" : "none";
  },
  /** S3-compatible endpoint, e.g. https://<account>.r2.cloudflarestorage.com. Path-style requests. */
  get evidenceS3Endpoint(): string {
    return process.env.EVIDENCE_S3_ENDPOINT ?? "";
  },
  get evidenceS3Bucket(): string {
    return process.env.EVIDENCE_S3_BUCKET ?? "";
  },
  /** R2 expects "auto"; AWS expects the bucket's region. */
  get evidenceS3Region(): string {
    return process.env.EVIDENCE_S3_REGION || "auto";
  },
  get evidenceS3AccessKeyId(): string {
    return process.env.EVIDENCE_S3_ACCESS_KEY_ID ?? "";
  },
  get evidenceS3SecretAccessKey(): string {
    return process.env.EVIDENCE_S3_SECRET_ACCESS_KEY ?? "";
  },
  /** Days a sealed blob is kept before the purge job deletes it. Invalid or unset -> 90. */
  get evidenceRetentionDays(): number {
    const n = Number(process.env.EVIDENCE_RETENTION_DAYS);
    return Number.isFinite(n) && n > 0 ? n : 90;
  },
  /** Max SEALED bytes per photo (after decoding). Invalid or unset -> 5 MiB. */
  get evidenceMaxBytes(): number {
    const n = Number(process.env.EVIDENCE_MAX_BYTES);
    return Number.isSafeInteger(n) && n > 0 ? n : 5 * 1024 * 1024;
  },
};

export function relayerConfigured(): boolean {
  return Boolean(env.rpcUrls.length > 0 && env.relayerPrivateKey && env.easSchemaUid);
}

/** True when the given trigger should fire a notification per NOTIFY_ON. */
export function notifyOnTrigger(trigger: "sync" | "attest"): boolean {
  return env.notifyOn === "both" || env.notifyOn === trigger;
}
