// signature.ts: ed25519 sign/verify over the canonical proof payload.
// Private key lives in the OS secure store on-device (Keychain/Keystore) — NOT hardware attestation.
// This module only does the curve math; key storage is the mobile app's responsibility.

import { ed25519 } from "@noble/curves/ed25519";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils";
import { canonicalPayload, type ProofPublicPayload, type SignedProof } from "./types.js";

export interface KeyPair {
  privateKey: string;
  publicKey: string;
}

export function generateKeyPair(): KeyPair {
  const priv = ed25519.utils.randomPrivateKey();
  return { privateKey: bytesToHex(priv), publicKey: bytesToHex(ed25519.getPublicKey(priv)) };
}

export function signPayload(payload: ProofPublicPayload, privateKeyHex: string): SignedProof {
  const priv = hexToBytes(privateKeyHex);
  const msg = utf8ToBytes(canonicalPayload(payload));
  return {
    ...payload,
    signature: bytesToHex(ed25519.sign(msg, priv)),
    publicKey: bytesToHex(ed25519.getPublicKey(priv)),
  };
}

export function verifyProof(proof: SignedProof): boolean {
  try {
    const msg = utf8ToBytes(canonicalPayload(proof));
    return ed25519.verify(hexToBytes(proof.signature), msg, hexToBytes(proof.publicKey));
  } catch {
    return false;
  }
}
