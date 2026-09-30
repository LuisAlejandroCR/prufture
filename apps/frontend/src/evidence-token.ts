// evidence-token.ts: the per-proof evidence token. token = HMAC-SHA256(device secret, proofHash); the
// device registers sha256(token) on the proof's first /sync and presents the token to /evidence and
// /evidence-requests, so a public proofHash alone can never upload for, or probe, someone's report.
// The secret is 32 random bytes in expo-secure-store; nothing here is logged. Never throws.

import { hmac } from "@noble/hashes/hmac";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, hexToBytes, randomBytes, utf8ToBytes } from "@noble/hashes/utils";

const DOMAIN = "prufture-evidence-token-v1|";
const SECRET_KEY = "proof.device.evidence.secret";
const HEX64 = /^[0-9a-f]{64}$/;

/** Deterministic: the same device secret and proofHash always give the same token. */
export function deriveEvidenceToken(secretHex: string, proofHash: string): string {
  return bytesToHex(hmac(sha256, hexToBytes(secretHex), utf8ToBytes(DOMAIN + proofHash)));
}

/** What /sync registers. Matches the api's sha256 over the token's hex string. */
export function hashEvidenceToken(token: string): string {
  return bytesToHex(sha256(utf8ToBytes(token)));
}

export type SecretSource = () => Promise<string | null>;

let injected: SecretSource | null = null;
let cached: string | null = null;
// One shared first read, so two callers can never each create (and store) a different secret.
let loading: Promise<string | null> | null = null;

/** Test seam: swap where the device secret comes from. Pass null to restore the device default. */
export function __setEvidenceSecretSource(src: SecretSource | null): void {
  injected = src;
  cached = null;
  loading = null;
}

async function deviceSecret(): Promise<string | null> {
  if (injected) return injected();
  if (cached) return cached;
  loading ??= loadOrCreateSecret().finally(() => {
    loading = null;
  });
  return loading;
}

async function loadOrCreateSecret(): Promise<string | null> {
  try {
    const SecureStore = await import("expo-secure-store");
    const existing = await SecureStore.getItemAsync(SECRET_KEY);
    if (existing && HEX64.test(existing)) return (cached = existing);
    const fresh = bytesToHex(randomBytes(32));
    await SecureStore.setItemAsync(SECRET_KEY, fresh, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
    return (cached = fresh);
  } catch {
    return null;
  }
}

/** The token for one proof, or null when the secret store is unavailable. Never throws. */
export async function evidenceTokenFor(proofHash: string): Promise<string | null> {
  if (!HEX64.test(proofHash)) return null;
  try {
    const secret = await deviceSecret();
    return secret && HEX64.test(secret) ? deriveEvidenceToken(secret, proofHash) : null;
  } catch {
    return null;
  }
}

/** sha256(token) for /sync, or null. Never throws. */
export async function evidenceTokenHashFor(proofHash: string): Promise<string | null> {
  const token = await evidenceTokenFor(proofHash);
  return token ? hashEvidenceToken(token) : null;
}
