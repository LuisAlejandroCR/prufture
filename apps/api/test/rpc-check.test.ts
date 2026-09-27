// rpc-check.test.ts: the phase 1 endpoint suite, run against fake providers — a correct node, a node
// on the wrong chain, a lagging node, one serving a different record, a pruned node — and the
// failover drill against local hung and refused sockets. Nothing here touches the chain.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Socket } from "node:net";
import { custom, encodeAbiParameters, encodeFunctionResult, http, parseAbiParameters, toHex, type Hex } from "viem";
import {
  EAS_GET_ATTESTATION_ABI,
  LIVE_ANCHOR,
  checkEndpoint,
  endpointsAgree,
  failoverDrill,
} from "../src/rpc-check.js";

const NOW_S = 1_790_000_000;
const EAS = "0x4200000000000000000000000000000000000021";
const ATTESTER = "0x99eB0048E00db64Fc3A78e323eAAAa3aEF774131";
const FOUR_FIELDS = encodeAbiParameters(
  parseAbiParameters("bytes32 proofHash, string taskId, string geohash, uint64 capturedAt"),
  [`0x${"12".repeat(32)}`, "solar-panel-install", "9q8yy", 1788824553n],
);

interface NodeOptions {
  chainId?: number;
  headAgeS?: number;
  data?: Hex;
  attester?: string;
  pruned?: boolean;
}

function attestationResult(o: NodeOptions): Hex {
  return encodeFunctionResult({
    abi: EAS_GET_ATTESTATION_ABI,
    functionName: "getAttestation",
    result: {
      uid: LIVE_ANCHOR.uid,
      schema: `0x${"32".repeat(32)}`,
      time: 1788824560n,
      expirationTime: 0n,
      revocationTime: 0n,
      refUID: `0x${"00".repeat(32)}`,
      recipient: "0x0000000000000000000000000000000000000000",
      attester: (o.attester ?? ATTESTER) as Hex,
      revocable: true,
      data: o.data ?? FOUR_FIELDS,
    },
  });
}

/** A fake Base Sepolia node answering exactly the calls the suite makes. */
function fakeNode(o: NodeOptions = {}) {
  return custom({
    async request({ method }: { method: string }) {
      switch (method) {
        case "eth_chainId":
          return toHex(o.chainId ?? 84532);
        case "eth_getBlockByNumber":
          return {
            number: "0x100",
            hash: `0x${"aa".repeat(32)}`,
            parentHash: `0x${"bb".repeat(32)}`,
            timestamp: toHex(NOW_S - (o.headAgeS ?? 2)),
            transactions: [],
          };
        case "eth_call":
          return attestationResult(o);
        case "eth_getTransactionReceipt":
          if (o.pruned) return null;
          return {
            status: "0x1",
            to: EAS,
            blockNumber: "0x99",
            blockHash: `0x${"cc".repeat(32)}`,
            transactionHash: LIVE_ANCHOR.txHash,
            transactionIndex: "0x0",
            from: ATTESTER,
            logs: [],
            logsBloom: `0x${"00".repeat(256)}`,
            cumulativeGasUsed: "0x1",
            gasUsed: "0x1",
            effectiveGasPrice: "0x1",
            contractAddress: null,
            type: "0x2",
          };
        default:
          throw new Error(`unexpected ${method}`);
      }
    },
  });
}

const check = (o: NodeOptions = {}, url = "https://rpc.vendor.example/SECRET-KEY") =>
  checkEndpoint(url, { transport: fakeNode(o), now: () => NOW_S * 1000 });

const byName = (r: Awaited<ReturnType<typeof check>>, name: string) => r.checks.find((c) => c.name === name);

test("a healthy node passes every check and labels itself by host only", async () => {
  const r = await check();
  assert.equal(r.passed, true);
  assert.equal(r.endpoint, "rpc.vendor.example");
  assert.ok(r.checks.every((c) => c.ok));
  assert.ok(r.fingerprint);
  assert.ok(!JSON.stringify(r).includes("SECRET-KEY"), "the report must not carry the endpoint path");
});

test("a node on another chain fails", async () => {
  const r = await check({ chainId: 8453 });
  assert.equal(r.passed, false);
  assert.equal(byName(r, "chain-id")?.detail, "WrongChain(8453)");
});

test("a lagging node fails the fresh-head check", async () => {
  const r = await check({ headAgeS: 600 });
  assert.equal(r.passed, false);
  assert.equal(byName(r, "fresh-head")?.ok, false);
});

test("an attestation carrying anything beyond the four fields fails", async () => {
  const r = await check({ data: `${FOUR_FIELDS}deadbeef` as Hex });
  assert.equal(r.passed, false);
  assert.equal(byName(r, "eas-read")?.detail, "UnexpectedAttestationData");
});

test("a pruned node only warns: the receipt check is optional", async () => {
  const r = await check({ pruned: true });
  assert.equal(r.passed, true);
  const receipt = byName(r, "anchor-receipt");
  assert.equal(receipt?.ok, false);
  assert.equal(receipt?.required, false);
});

test("endpoints agree only when every one passes and reads the same record", async () => {
  assert.equal(endpointsAgree([await check(), await check({ pruned: true })]), true);
  assert.equal(endpointsAgree([await check(), await check({ attester: "0x2222222222222222222222222222222222222222" })]), false);
  assert.equal(endpointsAgree([await check(), await check({ chainId: 1 })]), false);
});

test("the failover drill: past a hung and a refused endpoint to a live one, and bounded when all are dead", async () => {
  const sockets = new Set<Socket>();
  const hung = createServer((s) => sockets.add(s));
  await new Promise<void>((r) => hung.listen(0, "127.0.0.1", r));
  const refused = createServer();
  await new Promise<void>((r) => refused.listen(0, "127.0.0.1", r));
  const refusedPort = (refused.address() as { port: number }).port;
  await new Promise((r) => refused.close(r));

  const timeout = 300;
  try {
    const drill = await failoverDrill(
      fakeNode(),
      [
        http(`http://127.0.0.1:${(hung.address() as { port: number }).port}`, { timeout, retryCount: 0 }),
        http(`http://127.0.0.1:${refusedPort}`, { timeout, retryCount: 0 }),
      ],
      timeout,
    );
    assert.deepEqual(
      drill.map((c) => [c.name, c.ok]),
      [
        ["failover-to-live", true],
        ["all-dead-bounded", true],
      ],
    );
  } finally {
    sockets.forEach((s) => s.destroy());
    hung.close();
  }
});
