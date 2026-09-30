// relayer.invariant.test.ts: properties that must hold for EVERY payload, always.
// These encode the project rules for the relayer: least privilege (attest() only),
// no funds ever move, zero PII on the wire, and the user flow never throws.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { decodeAbiParameters, parseAbiParameters, bytesToHex } from "viem";
import { buildAttestRequest, submitAttestation } from "../src/relayer.js";
import type { ProofPublicPayload } from "@proof/core";

const SCHEMA = parseAbiParameters(
  "bytes32 proofHash, string taskId, string geohash, uint64 capturedAt",
);
const ZERO_ADDR = "0x0000000000000000000000000000000000000000";
const ZERO_B32 = "0x0000000000000000000000000000000000000000000000000000000000000000";

function samplePayloads(): ProofPublicPayload[] {
  const mk = (o: Partial<ProofPublicPayload> = {}): ProofPublicPayload => ({
    proofHash: bytesToHex(randomBytes(32)).slice(2),
    taskId: "task-solar-01",
    geohash: "u4pruy",
    capturedAt: "2026-09-07T10:00:00.000Z",
    ...o,
  });
  return [
    mk(),
    mk({ taskId: "", geohash: "" }),
    mk({ proofHash: `0x${"f".repeat(64)}` }),
    mk({ taskId: "a".repeat(300), geohash: "b".repeat(50) }),
    mk({ capturedAt: "1970-01-01T00:00:00Z" }),
    mk({ taskId: "emoji 🛰️ and 汉字", geohash: "gcpv" }),
  ];
}

test("invariant: only attest() on env.easContract is ever reachable (least privilege)", () => {
  for (const p of samplePayloads()) {
    const req = buildAttestRequest(p);
    assert.equal(req.functionName, "attest");
    // The bundled ABI exposes exactly one callable function: attest.
    const fns = req.abi.filter((e) => e.type === "function").map((e) => e.name);
    assert.deepEqual(fns, ["attest"]);
    assert.match(req.address, /^0x[0-9a-fA-F]{40}$/);
  }
});

test("invariant: no funds ever move (recipient 0x0, value 0, no expiry, no refUID)", () => {
  for (const p of samplePayloads()) {
    const { data } = buildAttestRequest(p).args[0];
    assert.equal(data.recipient, ZERO_ADDR);
    assert.equal(data.value, 0n);
    assert.equal(data.expirationTime, 0n);
    assert.equal(data.refUID, ZERO_B32);
  }
});

test("invariant: the wire payload is exactly the 4 zero-PII fields, nothing else", () => {
  for (const p of samplePayloads()) {
    // Feed a payload carrying PII-shaped extras; they must not survive encoding.
    const withExtras = { ...p, publicKey: "DEAD", signature: "BEEF", mediaUri: "file:///photo.jpg" };
    const { data } = buildAttestRequest(withExtras as ProofPublicPayload).args[0];

    const decoded = decodeAbiParameters(SCHEMA, data.data);
    assert.equal(decoded.length, 4);
    const [hash, taskId, geohash, capturedAt] = decoded;
    assert.equal(hash, `0x${(p.proofHash.replace(/^0x/, "")).toLowerCase()}`);
    assert.equal(taskId, p.taskId);
    assert.equal(geohash, p.geohash);
    assert.equal(capturedAt, BigInt(Math.floor(Date.parse(p.capturedAt) / 1000)));

    const blob = data.data.toLowerCase();
    assert.ok(!blob.includes("dead"), "publicKey leaked into calldata");
    assert.ok(!blob.includes("beef"), "signature leaked into calldata");
    assert.ok(!blob.includes(Buffer.from("file:///photo.jpg").toString("hex")), "mediaUri leaked");
  }
});

test("invariant: submitAttestation never throws and returns a typed envelope (unconfigured)", async () => {
  const hostile: unknown[] = [
    { proofHash: "zzz", taskId: 1, geohash: null, capturedAt: "nope" },
    {},
    { proofHash: "a".repeat(64), taskId: "t", geohash: "g", capturedAt: "2026-01-01T00:00:00Z" },
  ];
  for (const p of hostile) {
    const res = await submitAttestation(p as ProofPublicPayload);
    assert.equal(res.available, false);
    assert.equal(res.source, "relayer/eas");
    assert.equal(typeof res.checkedAt, "string");
    assert.equal(res.data, null);
    assert.equal(typeof res.error, "string");
  }
});

test("invariant: submitAttestation degrades (never throws) even when misconfigured with a dead RPC", () => {
  // A child process keeps this end-to-end: a fresh module graph, a bogus but well-formed
  // config, and a dead RPC — proving the degradation path without touching this process's env.
  const here = dirname(fileURLToPath(import.meta.url));
  const relayerUrl = pathToFileURL(resolve(here, "../src/relayer.ts")).href;
  const script = `
    import { submitAttestation } from ${JSON.stringify(relayerUrl)};
    const r = await submitAttestation({ proofHash: "a".repeat(64), taskId: "t", geohash: "g", capturedAt: "2026-01-01T00:00:00Z" });
    if (r.available !== false) { console.error("expected unavailable"); process.exit(2); }
    if (typeof r.error !== "string" || r.error.length === 0) { console.error("missing error string"); process.exit(3); }
    console.log("OK");
  `;
  const out = execFileSync(
    process.execPath,
    ["--import", "tsx", "--input-type=module", "-e", script],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        DWELLIR_RPC_URL: "http://127.0.0.1:1/not-a-real-rpc",
        RELAYER_PRIVATE_KEY: `0x${"1".repeat(64)}`,
        EAS_SCHEMA_UID: `0x${"2".repeat(64)}`,
      },
    },
  );
  assert.match(out, /OK/);
});
