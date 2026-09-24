// rpc-config.test.ts: Phase 1 of the provider portability plan — the Base Sepolia RPC endpoint
// is vendor-neutral. RPC_URL is the supported name, DWELLIR_RPC_URL is a deprecated fallback
// kept so an existing deployment survives the rename. Nothing here touches the chain: these
// assert the *resolution* rules and that an unconfigured relayer still degrades typed.

import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { env } from "../src/env.js";
import { submitAttestation } from "../src/relayer.js";

const here = dirname(fileURLToPath(import.meta.url));

const RPC_KEYS = ["RPC_URL", "DWELLIR_RPC_URL", "RELAYER_PRIVATE_KEY", "EAS_SCHEMA_UID"] as const;

function clear(): void {
  for (const k of RPC_KEYS) delete process.env[k];
}

afterEach(clear);

test("neither name set => empty endpoint, not legacy", () => {
  clear();
  assert.equal(env.rpcUrl, "");
  assert.equal(env.rpcUrlIsLegacy, false);
});

test("RPC_URL alone is used and is not flagged legacy", () => {
  clear();
  process.env.RPC_URL = "https://any-provider.example/base-sepolia";
  assert.equal(env.rpcUrl, "https://any-provider.example/base-sepolia");
  assert.equal(env.rpcUrlIsLegacy, false);
});

test("DWELLIR_RPC_URL alone still works and is flagged legacy", () => {
  clear();
  process.env.DWELLIR_RPC_URL = "https://legacy-vendor.example/base-sepolia";
  assert.equal(env.rpcUrl, "https://legacy-vendor.example/base-sepolia");
  assert.equal(env.rpcUrlIsLegacy, true);
});

test("RPC_URL takes precedence over the deprecated name", () => {
  clear();
  process.env.RPC_URL = "https://new-provider.example/base-sepolia";
  process.env.DWELLIR_RPC_URL = "https://legacy-vendor.example/base-sepolia";
  assert.equal(env.rpcUrl, "https://new-provider.example/base-sepolia");
  assert.equal(env.rpcUrlIsLegacy, false);
});

test("an empty RPC_URL falls back to the deprecated name rather than blanking it", () => {
  clear();
  process.env.RPC_URL = "";
  process.env.DWELLIR_RPC_URL = "https://legacy-vendor.example/base-sepolia";
  assert.equal(env.rpcUrl, "https://legacy-vendor.example/base-sepolia");
});

// relayerPrivateKey / easSchemaUid are snapshot at module load (unlike the rpcUrl getter), so
// the whole-config check runs in a subprocess with the env preset — the same convention
// relayer.invariant.test.ts uses. This is what proves the deprecated name still configures a
// real deployment end to end.
function configuredUnder(vars: Record<string, string>): boolean {
  const envUrl = pathToFileURL(resolve(here, "../src/env.ts")).href;
  const script = `
    import { relayerConfigured } from ${JSON.stringify(envUrl)};
    console.log(relayerConfigured() ? "YES" : "NO");
  `;
  const out = execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], {
    encoding: "utf8",
    env: { ...process.env, RPC_URL: "", DWELLIR_RPC_URL: "", ...vars },
  });
  return /YES/.test(out);
}

test("relayerConfigured() is satisfied by either endpoint name", () => {
  const keys = { RELAYER_PRIVATE_KEY: `0x${"1".repeat(64)}`, EAS_SCHEMA_UID: `0x${"2".repeat(64)}` };

  assert.equal(configuredUnder(keys), false, "no endpoint under either name");
  assert.equal(
    configuredUnder({ ...keys, DWELLIR_RPC_URL: "https://legacy-vendor.example/base-sepolia" }),
    true,
    "deprecated name still configures the relayer",
  );
  assert.equal(
    configuredUnder({ ...keys, RPC_URL: "https://any-provider.example/base-sepolia" }),
    true,
    "supported name configures the relayer",
  );
});

test("with no endpoint the relayer degrades typed and names RPC_URL, not the vendor", async () => {
  clear();
  const r = await submitAttestation({
    proofHash: "a".repeat(64),
    taskId: "task-solar-01",
    geohash: "u4pru",
    capturedAt: "2026-09-07T10:00:00.000Z",
  });
  assert.equal(r.available, false);
  assert.equal(r.data, null);
  assert.equal(r.source, "relayer/eas");
  assert.match(r.error ?? "", /RPC_URL/);
  assert.doesNotMatch(r.error ?? "", /DWELLIR/i, "the public error must not carry a vendor name");
});
