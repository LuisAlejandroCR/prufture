// evidence-seal.test.ts: sealEvidence() round-trips a photo to the programme private key, is
// non-deterministic, fails closed on the wrong key or a flipped bit, cannot be opened as a location
// seal (separate HKDF info), and bytesToBase64 matches Node's encoder on multi-chunk input.

import { test } from "node:test";
import assert from "node:assert/strict";
import { x25519 } from "@noble/curves/ed25519";
import { SEALED_OVERHEAD, bytesToBase64, isProgrammeKey, openEvidence, sealEvidence } from "../src/evidence-seal.js";
import { openPrecise } from "../src/location-seal.js";

const toHex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
function keypair() {
  const priv = x25519.utils.randomPrivateKey();
  return { privHex: toHex(priv), pubHex: toHex(x25519.getPublicKey(priv)) };
}
const PHOTO = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, ...new TextEncoder().encode("JFIF photo body"), ...new Uint8Array(5000).map((_, i) => i % 251)]);

test("round-trips a photo against the matching private key", () => {
  const { privHex, pubHex } = keypair();
  const sealed = sealEvidence(pubHex, PHOTO);
  assert.equal(sealed.length, PHOTO.length + SEALED_OVERHEAD);
  assert.deepEqual(openEvidence(privHex, sealed), PHOTO);
});

test("fresh ephemeral key + nonce: the same photo never seals to the same bytes", () => {
  const { pubHex } = keypair();
  const seen = new Set<string>();
  for (let i = 0; i < 10; i += 1) seen.add(toHex(sealEvidence(pubHex, PHOTO)));
  assert.equal(seen.size, 10);
});

test("the sealed blob does not start like a JPEG and carries no plaintext run", () => {
  const { pubHex } = keypair();
  const sealed = sealEvidence(pubHex, PHOTO);
  assert.notDeepEqual([...sealed.slice(0, 3)], [0xff, 0xd8, 0xff]);
  assert.ok(!Buffer.from(sealed).includes(Buffer.from("JFIF photo body")));
});

test("fails closed: wrong key, tampered byte, truncated blob", () => {
  const a = keypair();
  const b = keypair();
  const sealed = sealEvidence(a.pubHex, PHOTO);
  assert.throws(() => openEvidence(b.privHex, sealed));
  const tampered = sealed.slice();
  tampered[tampered.length - 1]! ^= 1;
  assert.throws(() => openEvidence(a.privHex, tampered));
  assert.throws(() => openEvidence(a.privHex, sealed.slice(0, SEALED_OVERHEAD - 1)));
});

test("domain separation: an evidence blob cannot be opened as a location seal", () => {
  const { privHex, pubHex } = keypair();
  const sealed = sealEvidence(pubHex, new TextEncoder().encode('{"geohash9":"d2g62x9yq"}'));
  assert.throws(() => openPrecise(privHex, toHex(sealed)));
});

test("rejects a malformed programme key", () => {
  assert.equal(isProgrammeKey(""), false);
  assert.equal(isProgrammeKey("zz"), false);
  assert.equal(isProgrammeKey("ab".repeat(31)), false);
  assert.equal(isProgrammeKey(keypair().pubHex), true);
  assert.throws(() => sealEvidence("ab".repeat(31), PHOTO));
});

test("bytesToBase64 matches Buffer on input larger than one chunk", () => {
  const big = new Uint8Array(100_000).map((_, i) => (i * 7) % 256);
  assert.equal(bytesToBase64(big), Buffer.from(big).toString("base64"));
  assert.equal(bytesToBase64(new Uint8Array()), "");
});
