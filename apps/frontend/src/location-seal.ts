// location-seal.ts: seals the precise location on-device to the programme team's X25519 public key
// (ephemeral X25519 -> HKDF-SHA256 -> XChaCha20-Poly1305); the app never holds a decrypt key. This
// precise tier is never signed and never reaches the chain.

import { xchacha20poly1305 } from "@noble/ciphers/chacha";
import { x25519 } from "@noble/curves/ed25519";
import { hkdf } from "@noble/hashes/hkdf";
import { sha256 } from "@noble/hashes/sha256";
import { randomBytes } from "@noble/hashes/utils";

const INFO = new TextEncoder().encode("prufture-location-seal-v1");
const EPH_PUB_LEN = 32;
const NONCE_LEN = 24;

function fromHex(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0 || /[^0-9a-fA-F]/.test(clean)) {
    throw new Error("programme public key must be hex");
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function deriveKey(shared: Uint8Array, ephPub: Uint8Array, recipientPub: Uint8Array): Uint8Array {
  const salt = new Uint8Array(ephPub.length + recipientPub.length);
  salt.set(ephPub, 0);
  salt.set(recipientPub, ephPub.length);
  return hkdf(sha256, shared, salt, INFO, 32);
}

/**
 * Seal `plaintext` to `programmePubKeyHex` (an X25519 public key, hex).
 * Returns hex of `ephemeralPub(32) || nonce(24) || ciphertext+tag`.
 * Fresh ephemeral key + random nonce every call, so the same input never
 * produces the same ciphertext.
 */
export function sealPrecise(programmePubKeyHex: string, plaintext: string): string {
  const recipientPub = fromHex(programmePubKeyHex);
  if (recipientPub.length !== 32) throw new Error("programme public key must be 32 bytes");

  const ephPriv = x25519.utils.randomPrivateKey();
  const ephPub = x25519.getPublicKey(ephPriv);
  const shared = x25519.getSharedSecret(ephPriv, recipientPub);
  const key = deriveKey(shared, ephPub, recipientPub);

  const nonce = randomBytes(NONCE_LEN);
  const ct = xchacha20poly1305(key, nonce).encrypt(new TextEncoder().encode(plaintext));

  const out = new Uint8Array(EPH_PUB_LEN + NONCE_LEN + ct.length);
  out.set(ephPub, 0);
  out.set(nonce, EPH_PUB_LEN);
  out.set(ct, EPH_PUB_LEN + NONCE_LEN);
  return toHex(out);
}

/**
 * Open a `sealPrecise` output with the programme PRIVATE key (hex).
 * Test / programme-side only — the app never calls this.
 */
export function openPrecise(programmePrivKeyHex: string, cipherHex: string): string {
  const priv = fromHex(programmePrivKeyHex);
  const blob = fromHex(cipherHex);
  if (blob.length < EPH_PUB_LEN + NONCE_LEN + 16) throw new Error("ciphertext too short");

  const ephPub = blob.slice(0, EPH_PUB_LEN);
  const nonce = blob.slice(EPH_PUB_LEN, EPH_PUB_LEN + NONCE_LEN);
  const ct = blob.slice(EPH_PUB_LEN + NONCE_LEN);

  const recipientPub = x25519.getPublicKey(priv);
  const shared = x25519.getSharedSecret(priv, ephPub);
  const key = deriveKey(shared, ephPub, recipientPub);

  return new TextDecoder().decode(xchacha20poly1305(key, nonce).decrypt(ct));
}
