// keystore.ts: device ed25519 key, stored in expo-secure-store (OS Keychain/Keystore).
// This is OS secure storage only — NOT hardware attestation, TEE signing, or Play Integrity.

import * as SecureStore from "expo-secure-store";
import { generateKeyPair } from "@proof/core";

const KEY = "proof.device.ed25519.priv";

export async function getOrCreatePrivateKey(): Promise<string> {
  const existing = await SecureStore.getItemAsync(KEY);
  if (existing) return existing;
  const kp = generateKeyPair();
  await SecureStore.setItemAsync(KEY, kp.privateKey, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  return kp.privateKey;
}
