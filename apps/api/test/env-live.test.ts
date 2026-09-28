// env-live.test.ts: every env.* field is read at call time, not snapshot at import.
// A snapshot let a "configured" check disagree with what the call would actually do, and forced tests
// to spawn child processes to vary config; these assertions stop that form creeping back in.

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
  ["RPC_URL", "rpcUrl", "https://probe.example/rpc", "https://probe.example/rpc"],
  ["RPC_FALLBACK_URLS", "rpcUrls", "https://a.example,https://b.example", ["https://a.example", "https://b.example"]],
  ["OZ_RELAYER_URL", "ozRelayerUrl", "https://oz.example", "https://oz.example"],
  ["OZ_RELAYER_NETWORK", "ozRelayerNetwork", "probe-net", "probe-net"],
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
  setProbe("OZ_RELAYER_NETWORK", "probe-net");
  assert.equal(env.ozRelayerNetwork, "probe-net");
  delete process.env.OZ_RELAYER_NETWORK;
  assert.equal(env.ozRelayerNetwork, "base-sepolia", "the documented default must come back");
});
