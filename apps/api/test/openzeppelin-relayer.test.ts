// openzeppelin-relayer.test.ts: the OZ Relayer submitter, against a fake relayer (no network or chain).
// Only allowlisted zero-value attest() calldata is queued, only on the pinned relayer; a slow relayer
// never causes a second tx for one proof, and no credential or vendor text leaks into a result.

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { bytesToHex, decodeFunctionData, getAddress } from "viem";
import type { ProofPublicPayload } from "@proof/core";
import { createOzRelayerSubmitter, type OzRelayerDeps } from "../src/submitters/openzeppelin-relayer.js";
import { buildAttestRequest } from "../src/relayer-request.js";
import { ATTEST_SELECTOR } from "../src/submitter.js";
import { attestOnce, selectedSubmitter, submitAttestation } from "../src/relayer.js";

const SCHEMA_UID = `0x${"24".repeat(32)}`;
const EAS = "0x4200000000000000000000000000000000000021";
const PINNED = "0x1111111111111111111111111111111111111111";
const OTHER = "0x2222222222222222222222222222222222222222";
const API_KEY = "oz-secret-api-key-do-not-leak";
const TX_HASH = `0x${"ab".repeat(32)}`;

function configure(): void {
  process.env.EAS_SCHEMA_UID = SCHEMA_UID;
  process.env.OZ_RELAYER_URL = "http://oz-relayer.internal:8080/";
  process.env.OZ_RELAYER_ID = "prufture-base-sepolia";
  process.env.OZ_RELAYER_API_KEY = API_KEY;
  process.env.OZ_RELAYER_ADDRESS = PINNED;
  delete process.env.OZ_RELAYER_NETWORK;
  delete process.env.ATTESTATION_SUBMITTER;
}

beforeEach(configure);

function payload(o: Partial<ProofPublicPayload> = {}): ProofPublicPayload {
  return {
    proofHash: bytesToHex(randomBytes(32)).slice(2),
    taskId: "task-solar-01",
    geohash: "u4pru",
    capturedAt: "2026-09-07T10:00:00.000Z",
    ...o,
  };
}

interface Seen {
  method: string;
  url: string;
  auth: string | null;
  body: Record<string, unknown> | null;
}

interface FakeOptions {
  relayer?: Record<string, unknown>;
  /** Hashes/statuses returned by successive reads of the queued transaction. */
  polls?: { hash?: string; status: string }[];
  /** The POST response's transaction overrides. */
  queued?: Record<string, unknown>;
  status?: number;
  rawBody?: string;
  throwOnFetch?: boolean;
}

/** A minimal OpenZeppelin Relayer: GET relayer, POST transaction, GET transaction. */
function fakeRelayer(o: FakeOptions = {}) {
  const seen: Seen[] = [];
  let polled = 0;
  const tx = (extra: Record<string, unknown>) => ({
    id: "tx-1",
    relayer_id: "prufture-base-sepolia",
    from: PINNED,
    to: EAS,
    value: "0",
    status: "pending",
    created_at: "2026-09-27T00:00:00Z",
    ...extra,
  });
  const reply = (data: unknown, status = 200) =>
    new Response(o.rawBody ?? JSON.stringify({ success: true, data }), { status: o.status ?? status });

  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    seen.push({
      method: init?.method ?? "GET",
      url,
      auth: headers.get("authorization"),
      body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null,
    });
    if (o.throwOnFetch) throw new Error(`connect ECONNREFUSED ${url} ${API_KEY}`);
    if (url.endsWith("/relayers/prufture-base-sepolia")) {
      return reply({
        id: "prufture-base-sepolia",
        network: "base-sepolia",
        network_type: "evm",
        paused: false,
        system_disabled: false,
        address: PINNED,
        ...o.relayer,
      });
    }
    if (url.endsWith("/transactions") && init?.method === "POST") {
      return reply(tx({ ...(o.queued ?? { hash: TX_HASH, status: "submitted" }) }));
    }
    if (url.includes("/transactions/")) {
      const step = o.polls?.[Math.min(polled, (o.polls?.length ?? 1) - 1)] ?? { status: "pending" };
      polled++;
      return reply(tx(step));
    }
    return new Response("not found", { status: 404 });
  }) as typeof fetch;

  return { fetchImpl, seen, posts: () => seen.filter((s) => s.method === "POST") };
}

function adapter(fake: ReturnType<typeof fakeRelayer>, deps: Partial<OzRelayerDeps> = {}) {
  return createOzRelayerSubmitter({ fetch: fake.fetchImpl, sleep: async () => {}, ...deps });
}

test("selected by ATTESTATION_SUBMITTER=openzeppelin-relayer", () => {
  process.env.ATTESTATION_SUBMITTER = "openzeppelin-relayer";
  assert.equal(selectedSubmitter().name, "openzeppelin-relayer");
});

test("configured only with URL, id, API key, a valid pinned address and a schema", () => {
  const fake = fakeRelayer();
  assert.equal(adapter(fake).isConfigured(), true);
  for (const key of ["OZ_RELAYER_URL", "OZ_RELAYER_ID", "OZ_RELAYER_API_KEY", "OZ_RELAYER_ADDRESS", "EAS_SCHEMA_UID"]) {
    configure();
    delete process.env[key];
    assert.equal(adapter(fake).isConfigured(), false, `${key} missing must leave it unconfigured`);
  }
  configure();
  process.env.OZ_RELAYER_ADDRESS = "not-an-address";
  assert.equal(adapter(fake).isConfigured(), false);
});

test("needs no RPC_URL and no RELAYER_PRIVATE_KEY: the key lives in the relayer", () => {
  delete process.env.RPC_URL;
  delete process.env.RELAYER_PRIVATE_KEY;
  assert.equal(adapter(fakeRelayer()).isConfigured(), true);
});

test("unconfigured: typed unavailable naming the settings, and nothing is contacted", async () => {
  delete process.env.OZ_RELAYER_API_KEY;
  process.env.ATTESTATION_SUBMITTER = "openzeppelin-relayer";
  const r = await submitAttestation(payload());
  assert.equal(r.available, false);
  assert.match(r.error ?? "", /OZ_RELAYER_API_KEY/);

  const fake = fakeRelayer();
  const direct = await adapter(fake).submit(payload());
  assert.equal(direct.available, false);
  assert.equal(fake.seen.length, 0);
});

test("attester() is the pinned address, checksummed, with no network call", () => {
  const fake = fakeRelayer();
  assert.equal(adapter(fake).attester?.(), getAddress(PINNED));
  assert.equal(fake.seen.length, 0);
  delete process.env.OZ_RELAYER_ID;
  assert.equal(adapter(fake).attester?.(), null);
});

test("queues exactly the allowlisted attest() call with zero value and returns the hash", async () => {
  const fake = fakeRelayer();
  const p = payload();
  const r = await adapter(fake).submit(p);

  assert.equal(r.available, true);
  assert.deepEqual(r.data, { txHash: TX_HASH, attester: getAddress(PINNED) });

  const [post] = fake.posts();
  assert.ok(post, "one transaction was queued");
  assert.equal(post.url, "http://oz-relayer.internal:8080/api/v1/relayers/prufture-base-sepolia/transactions");
  assert.equal(post.auth, `Bearer ${API_KEY}`);
  assert.equal(post.body?.to, EAS);
  assert.equal(post.body?.value, 0);
  assert.deepEqual(Object.keys(post.body ?? {}).sort(), ["data", "speed", "to", "value"]);

  const data = post.body?.data as `0x${string}`;
  assert.ok(data.startsWith(ATTEST_SELECTOR));
  const request = buildAttestRequest(p);
  const decoded = decodeFunctionData({ abi: request.abi, data });
  assert.equal(decoded.functionName, "attest");
  assert.deepEqual(decoded.args, request.args, "the relayer receives the shared builder's exact request");
});

test("the relayer's record is checked before any transaction is queued", async () => {
  const fake = fakeRelayer();
  await adapter(fake).submit(payload());
  assert.equal(fake.seen[0]?.method, "GET");
  assert.ok(fake.seen[0]?.url.endsWith("/relayers/prufture-base-sepolia"));
  assert.equal(fake.seen[1]?.method, "POST");
});

test("a queued transaction is polled until the relayer reports its hash", async () => {
  const fake = fakeRelayer({
    queued: { status: "pending" },
    polls: [{ status: "pending" }, { status: "sent", hash: TX_HASH }],
  });
  const r = await adapter(fake).submit(payload());
  assert.equal(r.available, true);
  assert.equal(r.data?.txHash, TX_HASH);
  assert.equal(fake.posts().length, 1);
  assert.ok(fake.seen.some((s) => s.url.endsWith("/transactions/tx-1")));
});

// Idempotency: a slow relayer never costs a second transaction.
test("still queued after the budget: unavailable now, and the retry re-polls instead of re-sending", async () => {
  const slow = fakeRelayer({ queued: { status: "pending" }, polls: [{ status: "pending" }] });
  const oz = adapter(slow, { pollAttempts: 2 });
  const p = payload();

  const first = await oz.submit(p);
  assert.equal(first.available, false);
  assert.match(first.error ?? "", /queued, not yet sent/);
  assert.equal(slow.posts().length, 1);

  const second = await oz.submit(p);
  assert.equal(second.available, false);
  assert.equal(slow.posts().length, 1, "the retry must not queue a second transaction");
});

test("a retry that finds the queued transaction sent returns its hash, still with one POST", async () => {
  const polls = [{ status: "pending" } as { status: string; hash?: string }];
  const fake = fakeRelayer({ queued: { status: "pending" }, polls });
  const oz = adapter(fake, { pollAttempts: 1 });
  const p = payload();

  assert.equal((await oz.submit(p)).available, false);
  polls[0] = { status: "submitted", hash: TX_HASH };
  const r = await oz.submit(p);
  assert.equal(r.available, true);
  assert.equal(r.data?.txHash, TX_HASH);
  assert.equal(fake.posts().length, 1);
});

test("a failed transaction is released, so a later call may queue a fresh one", async () => {
  const fake = fakeRelayer({ queued: { status: "pending" }, polls: [{ status: "failed" }] });
  const oz = adapter(fake);
  const p = payload();

  const r = await oz.submit(p);
  assert.equal(r.available, false);
  assert.match(r.error ?? "", /transaction failed/);
  await oz.submit(p);
  assert.equal(fake.posts().length, 2);
});

test("attestOnce skips the relayer entirely for a proof its pinned address already anchored", async () => {
  const fake = fakeRelayer();
  const r = await attestOnce(payload(), [{ attester: PINNED, txHash: TX_HASH }], adapter(fake));
  assert.equal(r.available, true);
  assert.equal(fake.seen.length, 0, "no call reaches the relayer for an anchored proof");
});

// Fail closed on the relayer's own record.
for (const [label, relayer, reason] of [
  ["a relayer reporting a different address", { address: OTHER }, /pinned OZ_RELAYER_ADDRESS/],
  ["a relayer with no address", { address: undefined }, /pinned OZ_RELAYER_ADDRESS/],
  ["a relayer on another network", { network: "base" }, /allowlisted network/],
  ["a non-EVM relayer", { network_type: "solana" }, /not an EVM relayer/],
  ["a paused relayer", { paused: true }, /paused/],
  ["a system-disabled relayer", { system_disabled: true }, /paused/],
] as const) {
  test(`fails closed before queueing anything: ${label}`, async () => {
    const fake = fakeRelayer({ relayer: relayer as Record<string, unknown> });
    const r = await adapter(fake).submit(payload());
    assert.equal(r.available, false);
    assert.match(r.error ?? "", reason);
    assert.equal(fake.posts().length, 0);
  });
}

test("OZ_RELAYER_NETWORK can pin a different network name", async () => {
  process.env.OZ_RELAYER_NETWORK = "base-sepolia-custom";
  const fake = fakeRelayer();
  const r = await adapter(fake).submit(payload());
  assert.equal(r.available, false);
  assert.equal(fake.posts().length, 0);
});

// Fail closed on what the relayer says it queued.
for (const [label, queued, reason] of [
  ["sent from another address", { from: OTHER, hash: TX_HASH }, /other than the pinned/],
  ["sent to another contract", { to: OTHER, hash: TX_HASH }, /does not target the EAS contract/],
  ["carrying value", { value: "1", hash: TX_HASH }, /carries value/],
  ["with no transaction id", { id: undefined, hash: TX_HASH }, /no transaction id/],
] as const) {
  test(`a queued transaction ${label} is not reported as an attestation`, async () => {
    const fake = fakeRelayer({ queued: queued as Record<string, unknown> });
    const r = await adapter(fake).submit(payload());
    assert.equal(r.available, false);
    assert.match(r.error ?? "", reason);
  });
}

test("a malformed hash is never returned as a transaction hash", async () => {
  const fake = fakeRelayer({ queued: { hash: "0xnothex", status: "submitted" }, polls: [{ status: "pending" }] });
  const r = await adapter(fake, { pollAttempts: 1 }).submit(payload());
  assert.equal(r.available, false);
});

// The policy still applies: nothing unallowlisted reaches the relayer.
test("with no schema allowlisted, nothing is sent to the relayer", async () => {
  const fake = fakeRelayer();
  const oz = adapter(fake);
  process.env.EAS_SCHEMA_UID = "";
  const r = await oz.submit(payload());
  assert.equal(r.available, false);
  assert.equal(fake.seen.length, 0);
});

test("a malformed schema UID is refused by the allowlist before the relayer is contacted", async () => {
  const fake = fakeRelayer();
  process.env.EAS_SCHEMA_UID = `0x${"99".repeat(31)}`; // 31 bytes: never allowlisted
  const r = await adapter(fake).submit(payload());
  assert.equal(r.available, false);
  assert.match(r.error ?? "", /schema/);
  assert.equal(fake.seen.length, 0);
});

// Hostile or broken relayer responses degrade without leaking.
for (const [label, o] of [
  ["a 401", { status: 401, rawBody: JSON.stringify({ success: false, error: `bad key ${API_KEY}` }) }],
  ["a 500", { status: 500, rawBody: `internal ${API_KEY}` }],
  ["a non-JSON body", { rawBody: `<html>${API_KEY}</html>` }],
  ["success:false", { rawBody: JSON.stringify({ success: false, data: null, error: API_KEY }) }],
  ["an unreachable relayer", { throwOnFetch: true }],
] as const) {
  test(`${label} degrades to a typed unavailable that leaks no key, URL or vendor text`, async () => {
    const fake = fakeRelayer(o as FakeOptions);
    const r = await adapter(fake).submit(payload());
    assert.equal(r.available, false);
    assert.equal(r.data, null);
    assert.equal(r.source, "relayer/eas");
    const blob = JSON.stringify(r);
    assert.ok(!blob.includes(API_KEY), "no API key");
    assert.ok(!blob.includes("oz-relayer.internal"), "no relayer URL");
    assert.ok(!blob.includes("html") && !blob.includes("bad key"), "no vendor body");
  });
}
