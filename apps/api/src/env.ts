// env.ts: reads config from process.env. Missing values degrade features, never crash the server.

export const env = {
  port: Number(process.env.PORT ?? 8787),
  dwellirRpcUrl: process.env.DWELLIR_RPC_URL ?? "",
  relayerPrivateKey: process.env.RELAYER_PRIVATE_KEY ?? "",
  easContract: process.env.EAS_CONTRACT_ADDRESS ?? "0x4200000000000000000000000000000000000021",
  easSchemaUid: process.env.EAS_SCHEMA_UID ?? "",
  chainId: Number(process.env.BASE_SEPOLIA_CHAIN_ID ?? 84532),
  neuroUrl: process.env.NEURO_AGENT_API_URL ?? "",
  neuroToken: process.env.NEURO_AGENT_API_TOKEN ?? "",

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
};

export function relayerConfigured(): boolean {
  return Boolean(env.dwellirRpcUrl && env.relayerPrivateKey && env.easSchemaUid);
}

/** True when the given trigger should fire a notification per NOTIFY_ON. */
export function notifyOnTrigger(trigger: "sync" | "attest"): boolean {
  return env.notifyOn === "both" || env.notifyOn === trigger;
}
