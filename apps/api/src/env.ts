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
  neuroLivenessPath: process.env.NEURO_LIVENESS_PATH ?? "/liveness",
};

export function relayerConfigured(): boolean {
  return Boolean(env.dwellirRpcUrl && env.relayerPrivateKey && env.easSchemaUid);
}
