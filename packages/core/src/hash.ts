// hash.ts: content hashing for captured media. Pure JS (no native build).
// sha256 over raw bytes — the hash is the proof anchor, nothing else identifies the file.

import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";

export function hashBytes(bytes: Uint8Array): string {
  return bytesToHex(sha256(bytes));
}
