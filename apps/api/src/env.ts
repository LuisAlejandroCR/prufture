// env.ts: reads config from process.env. Missing values degrade features, never crash the server.
//
// EVERY field is a live getter, read at call time rather than snapshot at import. That uniformity
// matters: when some fields were snapshot and others live, a "configured" check could disagree
// with what the call would actually do, and a test had to spawn a subprocess just to vary config.
// Nothing here caches, so a deploy — or a test — can change any value without re-importing.

export const env = {
  get port(): number {
    return Number(process.env.PORT ?? 8787);
  },

  // Vendor-neutral Base Sepolia JSON-RPC endpoint. RPC_URL is the supported name; any provider
  // serving the chain works, so switching is a config change and not a code change. The legacy
  // DWELLIR_RPC_URL is still honoured as a deprecated fallback so an existing deployment keeps
  // working across the rename. Read live (getter) so a test can flip it without re-importing.
  get rpcUrl(): string {
    return process.env.RPC_URL || process.env.DWELLIR_RPC_URL || "";
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

  // OpenZeppelin Relayer (ATTESTATION_SUBMITTER=openzeppelin-relayer): a self-hosted service that
  // holds the signing key, so none is kept in this process. OZ_RELAYER_ADDRESS pins the address
  // the relayer must report; a relayer that answers with any other key is refused.
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
  /** The OZ network name the relayer must be bound to. OZ calls Base Sepolia "base-sepolia". */
  get ozRelayerNetwork(): string {
    return process.env.OZ_RELAYER_NETWORK || "base-sepolia";
  },
  get neuroUrl(): string {
    return process.env.NEURO_AGENT_API_URL ?? "";
  },
  get neuroToken(): string {
    return process.env.NEURO_AGENT_API_TOKEN ?? "";
  },
  get neuroLivenessPath(): string {
    return process.env.NEURO_LIVENESS_PATH ?? "/liveness";
  },

  // Auto-notify: on sync/attest, best-effort send the public verifyUrl to the PROGRAMME team
  // (never the reporter). Off unless explicitly enabled. Recipients are fixed and env-configured;
  // the app never sends a phone/email and none is stored against a reporter. Read live (getters)
  // so a deploy — or a test — can flip them without re-importing this module.
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
  // Telegram chat id for manual /notify re-sends. Optional; unset means telegram degrades.
  get programmeTelegramChat(): string {
    return process.env.PROGRAMME_TELEGRAM_CHAT_ID ?? "";
  },

  // RevenueCat server-side entitlement check (apps/api/src/entitlement.ts). The secret key
  // never reaches the client — degrades (available:false) if unset.
  get revenuecatSecretKey(): string {
    return process.env.REVENUECAT_SECRET_KEY ?? "";
  },
  get revenuecatApiBase(): string {
    return process.env.REVENUECAT_API_BASE ?? "https://api.revenuecat.com/v2";
  },
  // RevenueCat v2 endpoints are project-scoped: /v2/projects/{project_id}/customers/...
  // Without this the entitlement check cannot build a valid URL and degrades typed.
  get revenuecatProjectId(): string {
    return process.env.REVENUECAT_PROJECT_ID ?? "";
  },
};

export function relayerConfigured(): boolean {
  return Boolean(env.rpcUrl && env.relayerPrivateKey && env.easSchemaUid);
}

/** True when the given trigger should fire a notification per NOTIFY_ON. */
export function notifyOnTrigger(trigger: "sync" | "attest"): boolean {
  return env.notifyOn === "both" || env.notifyOn === trigger;
}
