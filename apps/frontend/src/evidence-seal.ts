// evidence-seal.ts: seals an evidence photo on-device to the programme team's X25519 public key with
// the same construction as location-seal.ts (ephemeral X25519 -> HKDF-SHA256 -> XChaCha20-Poly1305),
// over raw bytes and with its own HKDF info string. The app never holds a decrypt key.

import { xchacha20poly1305 } from "@noble/ciphers/chacha";
import { x25519 } from "@noble/curves/ed25519";
import { hkdf } from "@noble/hashes/hkdf";
import { sha256 } from "@noble/hashes/sha256";
import { randomBytes } from "@noble/hashes/utils";

// Distinct from "prufture-location-seal-v1": a key derived for a photo can never open a location.
const INFO = new TextEncoder().encode("prufture-evidence-seal-v1");
const EPH_PUB_LEN = 32;
const NONCE_LEN = 24;
const TAG_LEN = 16;

/** Smallest possible sealed blob: ephemeral public key + nonce + tag. */
export const SEALED_OVERHEAD = EPH_PUB_LEN + NONCE_LEN + TAG_LEN;

export function fromHex(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0 || /[^0-9a-fA-F]/.test(clean)) {
    throw new Error("programme public key must be hex");
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** True when `hex` is a usable 32-byte X25519 public key. */
export function isProgrammeKey(hex: string): boolean {
  try {
    return fromHex(hex).length === 32;
  } catch {
    return false;
  }
}

function deriveKey(shared: Uint8Array, ephPub: Uint8Array, recipientPub: Uint8Array): Uint8Array {
  const salt = new Uint8Array(ephPub.length + recipientPub.length);
  salt.set(ephPub, 0);
  salt.set(recipientPub, ephPub.length);
  return hkdf(sha256, shared, salt, INFO, 32);
}

/**
 * Seal `photo` to `programmePubKeyHex`. Returns `ephemeralPub(32) || nonce(24) || ciphertext+tag`.
 * A fresh ephemeral key and nonce every call, so the same photo never seals to the same bytes.
 */
export function sealEvidence(programmePubKeyHex: string, photo: Uint8Array): Uint8Array {
  const recipientPub = fromHex(programmePubKeyHex);
  if (recipientPub.length !== 32) throw new Error("programme public key must be 32 bytes");

  const ephPriv = x25519.utils.randomPrivateKey();
  const ephPub = x25519.getPublicKey(ephPriv);
  const key = deriveKey(x25519.getSharedSecret(ephPriv, recipientPub), ephPub, recipientPub);
  const nonce = randomBytes(NONCE_LEN);
  const ct = xchacha20poly1305(key, nonce).encrypt(photo);

  const out = new Uint8Array(EPH_PUB_LEN + NONCE_LEN + ct.length);
  out.set(ephPub, 0);
  out.set(nonce, EPH_PUB_LEN);
  out.set(ct, EPH_PUB_LEN + NONCE_LEN);
  return out;
}

/** Open a sealEvidence() blob with the programme PRIVATE key (hex). Programme-side / tests only. */
export function openEvidence(programmePrivKeyHex: string, sealed: Uint8Array): Uint8Array {
  const priv = fromHex(programmePrivKeyHex);
  if (sealed.length < SEALED_OVERHEAD) throw new Error("ciphertext too short");
  const ephPub = sealed.slice(0, EPH_PUB_LEN);
  const nonce = sealed.slice(EPH_PUB_LEN, EPH_PUB_LEN + NONCE_LEN);
  const ct = sealed.slice(EPH_PUB_LEN + NONCE_LEN);
  const recipientPub = x25519.getPublicKey(priv);
  const key = deriveKey(x25519.getSharedSecret(priv, ephPub), ephPub, recipientPub);
  return xchacha20poly1305(key, nonce).decrypt(ct);
}

/** Standard base64 of raw bytes (chunked, so a multi-MB photo does not overflow the call stack). */
export function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return globalThis.btoa(bin);
}
