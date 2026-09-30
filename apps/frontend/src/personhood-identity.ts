// personhood-identity.ts: the reporter's programme-pass identity (a Semaphore identity), created once
// at random and kept sealed at rest: a 32-byte key in the OS secure store, the XChaCha20-Poly1305
// ciphertext of the private key in SQLite. Pure and injectable; the native binding is personhood-device.ts.
// The private key and secret scalar are never logged, returned to a screen, or sent anywhere.

import { Identity } from "@semaphore-protocol/identity";
import { xchacha20poly1305 } from "@noble/ciphers/chacha";
import { bytesToHex, hexToBytes, randomBytes } from "@noble/hashes/utils";

const KEY_LEN = 32;
const NONCE_LEN = 24;
/** Binds the ciphertext to its purpose, so a blob sealed for anything else never opens here. */
const AAD = new TextEncoder().encode("prufture-personhood-identity-v1");

/** Seal `plaintext` with a 32-byte key (hex). Returns hex of `nonce(24) || ciphertext+tag`. */
export function sealIdentitySecret(keyHex: string, plaintext: string): string {
  const key = hexToBytes(keyHex);
  if (key.length !== KEY_LEN) throw new Error("seal key must be 32 bytes");
  const nonce = randomBytes(NONCE_LEN);
  const ct = xchacha20poly1305(key, nonce, AAD).encrypt(new TextEncoder().encode(plaintext));
  const out = new Uint8Array(NONCE_LEN + ct.length);
  out.set(nonce, 0);
  out.set(ct, NONCE_LEN);
  return bytesToHex(out);
}

/** Open a sealIdentitySecret() output. Throws on a wrong key or any tampering. */
export function openIdentitySecret(keyHex: string, cipherHex: string): string {
  const key = hexToBytes(keyHex);
  const blob = hexToBytes(cipherHex);
  if (key.length !== KEY_LEN) throw new Error("seal key must be 32 bytes");
  if (blob.length < NONCE_LEN + 16) throw new Error("ciphertext too short");
  const nonce = blob.slice(0, NONCE_LEN);
  return new TextDecoder().decode(xchacha20poly1305(key, nonce, AAD).decrypt(blob.slice(NONCE_LEN)));
}

/** Where the two halves live. The device binding maps these to expo-secure-store and expo-sqlite. */
export interface IdentityStorage {
  getKey(): Promise<string | null>;
  setKey(keyHex: string): Promise<void>;
  getCipher(): Promise<string | null>;
  setCipher(cipherHex: string): Promise<void>;
}

/** What the prover needs. Held in memory only for the duration of one proof. */
export interface PersonhoodSecret {
  secretScalar: bigint;
  commitment: bigint;
}

export interface PersonhoodIdentity {
  /** Loads the sealed identity, or creates and seals a fresh random one on first use. */
  getIdentity(): Promise<PersonhoodSecret>;
  /** The public commitment (decimal) a coordinator enrols. Safe to show; reveals no secret. */
  getCommitment(): Promise<string>;
}

async function tryOpen(storage: IdentityStorage): Promise<Identity | null> {
  const [key, cipher] = await Promise.all([storage.getKey(), storage.getCipher()]);
  if (!key || !cipher) return null;
  try {
    return Identity.import(openIdentitySecret(key, cipher));
  } catch {
    // Either half lost or damaged (e.g. keychain kept across a reinstall, database wiped). The old
    // identity is unrecoverable; a new one is created and must be enrolled again.
    return null;
  }
}

async function createAndSeal(storage: IdentityStorage): Promise<Identity> {
  const identity = new Identity();
  const key = bytesToHex(randomBytes(KEY_LEN));
  const cipher = sealIdentitySecret(key, identity.export());
  await storage.setKey(key);
  await storage.setCipher(cipher);
  return identity;
}

export function createPersonhoodIdentity(storage: IdentityStorage): PersonhoodIdentity {
  let loading: Promise<Identity> | null = null;
  const load = (): Promise<Identity> => {
    if (!loading) {
      loading = (async () => (await tryOpen(storage)) ?? createAndSeal(storage))();
      // A failed load (storage unavailable) must not be cached forever.
      loading.catch(() => {
        loading = null;
      });
    }
    return loading;
  };
  return {
    async getIdentity() {
      const id = await load();
      return { secretScalar: id.secretScalar, commitment: id.commitment };
    },
    async getCommitment() {
      return (await load()).commitment.toString();
    },
  };
}
