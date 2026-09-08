// location-seal.test.ts: sealPrecise() encrypts the precise point to the programme
// key, is non-deterministic (ephemeral key + random nonce), only the matching private
// key opens it, and tampering fails the AEAD tag.

import { test } from "node:test";
import assert from "node:assert/strict";
import { x25519 } from "@noble/curves/ed25519";
import { openPrecise, sealPrecise } from "../src/location-seal.js";

function toHex(b: Uint8Array): string {
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

function demoKeypair() {
  const priv = x25519.utils.randomPrivateKey();
  return { privHex: toHex(priv), pubHex: toHex(x25519.getPublicKey(priv)) };
}

const PLAINTEXT = JSON.stringify({ geohash9: "d2g62x9yq", capturedAt: 1788824553 });

test("round-trips against the matching private key", () => {
  const { privHex, pubHex } = demoKeypair();
  const cipher = sealPrecise(pubHex, PLAINTEXT);
  assert.equal(openPrecise(privHex, cipher), PLAINTEXT);
});

test("ciphertext differs every call (ephemeral key + nonce)", () => {
  const { pubHex } = demoKeypair();
  const seen = new Set<string>();
  for (let i = 0; i < 20; i += 1) seen.add(sealPrecise(pubHex, PLAINTEXT));
  assert.equal(seen.size, 20);
});

test("output is hex and carries no plaintext substring", () => {
  const { pubHex } = demoKeypair();
  const cipher = sealPrecise(pubHex, PLAINTEXT);
  assert.match(cipher, /^[0-9a-f]+$/);
  assert.ok(!cipher.includes("d2g62"));
  assert.ok(!cipher.includes("1788824553"));
});

test("a different private key cannot open it", () => {
  const { pubHex } = demoKeypair();
  const other = demoKeypair();
  const cipher = sealPrecise(pubHex, PLAINTEXT);
  assert.throws(() => openPrecise(other.privHex, cipher));
});

test("a flipped byte fails the auth tag", () => {
  const { privHex, pubHex } = demoKeypair();
  const cipher = sealPrecise(pubHex, PLAINTEXT);
  const bytes = Buffer.from(cipher, "hex");
  const last = bytes.length - 1;
  bytes[last] = (bytes[last]! ^ 0x01) & 0xff;
  assert.throws(() => openPrecise(privHex, bytes.toString("hex")));
});

test("rejects a non-hex or wrong-length public key", () => {
  assert.throws(() => sealPrecise("not-hex!!", PLAINTEXT));
  assert.throws(() => sealPrecise("abcd", PLAINTEXT));
});
