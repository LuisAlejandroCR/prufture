// env-live.test.ts: every env.* field is read at call time, not snapshot at import.
//
// This used to be mixed: rpcUrl and the RevenueCat/notify fields were getters, while
// relayerPrivateKey, easSchemaUid, neuroUrl and friends were captured once when the module
// loaded. That split caused two concrete problems — a "configured" check could disagree with
// what the call would actually do, and a test had to spawn a child process just to vary
// configuration. These assertions stop the snapshot form creeping back in.

import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { env } from "../src/env.js";

// [env key, what env.* exposes it as, a probe value, the expected reading]
const FIELDS: [string, keyof typeof env, string, unknown][] = [
  ["PORT", "port", "9999", 9999],
  ["RELAYER_PRIVATE_KEY", "relayerPrivateKey", "0xabc", "0xabc"],
  ["EAS_CONTRACT_ADDRESS", "easContract", "0xfeed", "0xfeed"],
  ["EAS_SCHEMA_UID", "easSchemaUid", "0xbeef", "0xbeef"],
  ["BASE_SEPOLIA_CHAIN_ID", "chainId", "1234", 1234],
  ["NEURO_AGENT_API_URL", "neuroUrl", "https://probe.example", "https://probe.example"],
  ["NEURO_AGENT_API_TOKEN", "neuroToken", "probe-token", "probe-token"],
  ["NEURO_LIVENESS_PATH", "neuroLivenessPath", "/probe", "/probe"],
  ["RPC_URL", "rpcUrl", "https://probe.example/rpc", "https://probe.example/rpc"],
  ["PROGRAMME_WHATSAPP", "programmeWhatsapp", "+100", "+100"],
  ["PROGRAMME_EMAIL", "programmeEmail", "p@example.org", "p@example.org"],
  ["REVENUECAT_SECRET_KEY", "revenuecatSecretKey", "sk_probe", "sk_probe"],
  ["REVENUECAT_PROJECT_ID", "revenuecatProjectId", "proj_probe", "proj_probe"],
];

const saved = new Map<string, string | undefined>();

afterEach(() => {
  for (const [key, original] of saved) {
    if (original === undefined) delete process.env[key];
    else process.env[key] = original;
  }
  saved.clear();
});

function setProbe(key: string, value: string): void {
  if (!saved.has(key)) saved.set(key, process.env[key]);
  process.env[key] = value;
}

for (const [key, field, probe, expected] of FIELDS) {
  test(`env.${String(field)} reflects a change to ${key} without re-importing`, () => {
    setProbe(key, probe);
    assert.deepEqual(env[field], expected);
  });
}

test("no env field is a snapshot: every one is an accessor on the object", () => {
  for (const [, field] of FIELDS) {
    const descriptor = Object.getOwnPropertyDescriptor(env, field);
    assert.ok(descriptor, `env.${String(field)} is missing`);
    assert.equal(
      typeof descriptor.get,
      "function",
      `env.${String(field)} is a plain value — it would be snapshot at import`,
    );
  }
});

test("a field with a default falls back when the variable is cleared", () => {
  setProbe("NEURO_LIVENESS_PATH", "/probe");
  assert.equal(env.neuroLivenessPath, "/probe");
  delete process.env.NEURO_LIVENESS_PATH;
  assert.equal(env.neuroLivenessPath, "/liveness", "the documented default must come back");
});
