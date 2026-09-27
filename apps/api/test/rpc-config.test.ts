// rpc-config.test.ts: phase 1 endpoint resolution — RPC_URL, the deprecated DWELLIR_RPC_URL, and the
// RPC_FALLBACK_URLS list — and that a relayer whose endpoints are all dead still degrades typed, in
// bounded time. The dead endpoints are local sockets; nothing here touches the chain.

import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Socket } from "node:net";
import { env, relayerConfigured } from "../src/env.js";
import { submitAttestation, submitThrough } from "../src/relayer.js";
import { localKeySubmitter } from "../src/submitters/local-key.js";
import { publicError } from "../src/submitter.js";
import { endpointLabel, rpcTransport } from "../src/rpc.js";

const RPC_KEYS = ["RPC_URL", "DWELLIR_RPC_URL", "RPC_FALLBACK_URLS", "RELAYER_PRIVATE_KEY", "EAS_SCHEMA_UID"] as const;

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

test("relayerConfigured() is satisfied by either endpoint name", () => {
  clear();
  process.env.RELAYER_PRIVATE_KEY = `0x${"1".repeat(64)}`;
  process.env.EAS_SCHEMA_UID = `0x${"2".repeat(64)}`;

  assert.equal(relayerConfigured(), false, "no endpoint under either name");

  process.env.DWELLIR_RPC_URL = "https://legacy-vendor.example/base-sepolia";
  assert.equal(relayerConfigured(), true, "deprecated name still configures the relayer");

  delete process.env.DWELLIR_RPC_URL;
  process.env.RPC_URL = "https://any-provider.example/base-sepolia";
  assert.equal(relayerConfigured(), true, "supported name configures the relayer");
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

test("rpcUrls: the primary first, then RPC_FALLBACK_URLS, trimmed and de-duplicated", () => {
  clear();
  assert.deepEqual(env.rpcUrls, []);
  process.env.RPC_URL = "https://a.example";
  process.env.RPC_FALLBACK_URLS = " https://b.example ,, https://a.example,https://c.example ";
  assert.deepEqual(env.rpcUrls, ["https://a.example", "https://b.example", "https://c.example"]);
});

test("rpcUrls: the deprecated name is still the primary", () => {
  clear();
  process.env.DWELLIR_RPC_URL = "https://legacy.example";
  process.env.RPC_FALLBACK_URLS = "https://b.example";
  assert.deepEqual(env.rpcUrls, ["https://legacy.example", "https://b.example"]);
});

test("fallback endpoints alone configure the relayer", () => {
  clear();
  process.env.RELAYER_PRIVATE_KEY = `0x${"1".repeat(64)}`;
  process.env.EAS_SCHEMA_UID = `0x${"2".repeat(64)}`;
  process.env.RPC_FALLBACK_URLS = "https://b.example";
  assert.equal(relayerConfigured(), true);
});

test("rpcTransport refuses an empty endpoint list rather than guessing one", () => {
  assert.throws(() => rpcTransport([]), /no endpoint configured/);
  assert.equal(rpcTransport(["https://a.example"])({}).config.type, "http");
  assert.equal(rpcTransport(["https://a.example", "https://b.example"])({}).config.type, "fallback");
});

test("endpointLabel keeps the host and drops a key in the path or query", () => {
  assert.equal(endpointLabel("https://api.provider.example/v1/SECRETKEY?token=x"), "api.provider.example");
  assert.equal(endpointLabel("not a url"), "invalid-endpoint");
});

test("every endpoint dead or hung: the relayer degrades typed, in bounded time, leaking no URL", async () => {
  const sockets = new Set<Socket>();
  const hung = createServer((sock) => sockets.add(sock));
  await new Promise<void>((r) => hung.listen(0, "127.0.0.1", r));
  const refused = createServer();
  await new Promise<void>((r) => refused.listen(0, "127.0.0.1", r));
  const refusedPort = (refused.address() as { port: number }).port;
  await new Promise((r) => refused.close(r));

  clear();
  process.env.RPC_URL = `http://127.0.0.1:${(hung.address() as { port: number }).port}/KEY-IN-PATH`;
  process.env.RPC_FALLBACK_URLS = `http://127.0.0.1:${refusedPort}`;
  process.env.RELAYER_PRIVATE_KEY = `0x${"1".repeat(64)}`;
  process.env.EAS_SCHEMA_UID = `0x${"2".repeat(64)}`;
  try {
    const started = Date.now();
    const r = await submitAttestation({
      proofHash: "b".repeat(64),
      taskId: "task-solar-01",
      geohash: "u4pru",
      capturedAt: "2026-09-07T10:00:00.000Z",
    });
    const took = Date.now() - started;
    assert.equal(r.available, false);
    assert.equal(r.source, "relayer/eas");
    // Two endpoints, each timed out at most once per pass, the list retried once, plus slack.
    assert.ok(took < 2 * 5000 * 2 + 3000, `took ${took}ms`);
    assert.ok(!(r.error ?? "").includes("KEY-IN-PATH"), "the endpoint URL must not reach the result");
    assert.doesNotMatch(r.error ?? "", /https?:\/\//);
  } finally {
    sockets.forEach((sock) => sock.destroy());
    hung.close();
  }
});

test("a single hung endpoint holding a key in its path: the adapter's own error carries no URL", async () => {
  const sockets = new Set<Socket>();
  const hung = createServer((sock) => sockets.add(sock));
  await new Promise<void>((r) => hung.listen(0, "127.0.0.1", r));
  clear();
  process.env.RPC_URL = `http://127.0.0.1:${(hung.address() as { port: number }).port}/KEY-IN-PATH`;
  process.env.RELAYER_PRIVATE_KEY = `0x${"1".repeat(64)}`;
  process.env.EAS_SCHEMA_UID = `0x${"2".repeat(64)}`;
  try {
    const r = await localKeySubmitter.submit({
      proofHash: "c".repeat(64),
      taskId: "task-solar-01",
      geohash: "u4pru",
      capturedAt: "2026-09-07T10:00:00.000Z",
    });
    assert.equal(r.available, false);
    assert.match(r.error ?? "", /^rpc: /);
    assert.ok(!(r.error ?? "").includes("KEY-IN-PATH"));
    assert.ok(!(r.error ?? "").includes("127.0.0.1"));
    assert.ok(!(r.error ?? "").includes("\n"), "one line: no request body or call arguments");
  } finally {
    sockets.forEach((sock) => sock.destroy());
    hung.close();
  }
});

test("the port strips endpoint URLs from any adapter's error, not only local-key's", async () => {
  const leaky = {
    name: "leaky",
    isConfigured: () => true,
    async submit() {
      return {
        available: false as const,
        source: "relayer/eas",
        checkedAt: "now",
        data: null,
        error: "failed at https://rpc.vendor.example/SECRET123 and wss://ws.vendor.example/k\nbody: {...}",
      };
    },
  };
  const r = await submitThrough(leaky, {
    proofHash: "d".repeat(64),
    taskId: "task-solar-01",
    geohash: "u4pru",
    capturedAt: "2026-09-07T10:00:00.000Z",
  });
  assert.equal(r.available, false);
  assert.equal(r.error, "failed at [endpoint] and [endpoint]");
});

test("publicError keeps viem's short message, which names the failure without the URL", () => {
  const e = Object.assign(new Error("HTTP request failed.\n\nURL: https://x.example/KEY"), {
    shortMessage: "HTTP request failed.",
  });
  assert.equal(publicError(e), "HTTP request failed.");
  assert.equal(publicError("x".repeat(500)).length, 200);
  assert.equal(publicError(new Error("")), "unavailable");
});
