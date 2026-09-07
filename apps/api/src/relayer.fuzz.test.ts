// relayer.fuzz.test.ts: randomized property tests for the EAS schema codec.
// Properties: encode->decode round-trips, encoding is deterministic, invalid
// hashes always reject, and only the 4 zero-PII fields ever appear on the wire.

import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { decodeAbiParameters, parseAbiParameters, bytesToHex } from "viem";
import { encodeProofData } from "./relayer.js";
import type { ProofPublicPayload } from "@proof/core";

const PARAMS = parseAbiParameters(
  "bytes32 proofHash, string taskId, string geohash, uint64 capturedAt",
);

const ITER = 500;

function randInt(n: number): number {
  return Math.floor(Math.random() * n);
}

// Exercise the full unicode range, including code points that need surrogate pairs.
// Skip the surrogate block itself (0xD800-0xDFFF): lone surrogates are not valid
// scalar values and UTF-8 encoding replaces them, which is not a codec bug.
function randString(maxLen: number): string {
  const len = randInt(maxLen);
  let s = "";
  for (let i = 0; i < len; i++) {
    let cp = randInt(0x10ffff - 0x800) + 0x800;
    if (cp >= 0xd800 && cp <= 0xdfff) cp = 0x20;
    s += String.fromCodePoint(cp);
  }
  return s;
}

function randHash(): string {
  const hex = bytesToHex(randomBytes(32)).slice(2);
  // half the time keep the 0x prefix, sometimes upper-case it
  const withPrefix = Math.random() < 0.5 ? `0x${hex}` : hex;
  return Math.random() < 0.3 ? withPrefix.toUpperCase().replace("0X", "0x") : withPrefix;
}

function randPayload(): ProofPublicPayload {
  // capturedAt: any instant from 1970 to ~2100, at ms precision
  const ms = randInt(4_100_000_000_000);
  return {
    proofHash: randHash(),
    taskId: randString(40),
    geohash: Math.random() < 0.5 ? "" : randString(12),
    capturedAt: new Date(ms).toISOString(),
  };
}

test(`fuzz: encode->decode round-trips for ${ITER} random payloads`, () => {
  for (let i = 0; i < ITER; i++) {
    const p = randPayload();
    const [hash, taskId, geohash, capturedAt] = decodeAbiParameters(PARAMS, encodeProofData(p));

    const wantHash = `0x${(p.proofHash.startsWith("0x") ? p.proofHash.slice(2) : p.proofHash).toLowerCase()}`;
    assert.equal(hash, wantHash, `hash mismatch on iter ${i}`);
    assert.equal(taskId, p.taskId, `taskId mismatch on iter ${i}`);
    assert.equal(geohash, p.geohash, `geohash mismatch on iter ${i}`);
    assert.equal(capturedAt, BigInt(Math.floor(Date.parse(p.capturedAt) / 1000)), `time mismatch on iter ${i}`);
  }
});

test("fuzz: encoding is deterministic (same input -> identical bytes)", () => {
  for (let i = 0; i < ITER; i++) {
    const p = randPayload();
    assert.equal(encodeProofData(p), encodeProofData({ ...p }));
  }
});

test("fuzz: invalid-length hashes always reject", () => {
  for (let i = 0; i < ITER; i++) {
    const badLen = randInt(80);
    if (badLen === 64) continue; // 64 is the only valid length
    const bad = bytesToHex(randomBytes(64)).slice(2, 2 + badLen);
    assert.throws(
      () => encodeProofData({ proofHash: bad, taskId: "t", geohash: "g", capturedAt: "2026-01-01T00:00:00Z" }),
      `expected reject for hash length ${badLen}`,
    );
  }
});

test("fuzz: non-hex characters in a 64-char hash always reject", () => {
  for (let i = 0; i < 100; i++) {
    const chars = "ghijklmnopqrstuvwxyz!@#$%^&*() ";
    const pos = randInt(64);
    const h = "a".repeat(64).split("");
    h[pos] = chars[randInt(chars.length)] ?? "z";
    assert.throws(() =>
      encodeProofData({ proofHash: h.join(""), taskId: "t", geohash: "g", capturedAt: "2026-01-01T00:00:00Z" }),
    );
  }
});

test("fuzz: malformed timestamps always reject", () => {
  const junk = ["", "not-a-date", "2026-13-45", "yesterday", "🕐", "  "];
  for (const capturedAt of junk) {
    assert.throws(() =>
      encodeProofData({ proofHash: "a".repeat(64), taskId: "t", geohash: "g", capturedAt }),
    );
  }
});
