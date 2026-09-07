// base64.ts: decode base64 (from expo-camera / expo-file-system) to raw bytes.
// Pure, no native deps — kept separate from capture.ts so it is unit-testable off-device.

/** Decode a base64 string to bytes. Tolerates a leading `data:...;base64,` prefix. */
export function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.includes(",") ? b64.slice(b64.indexOf(",") + 1) : b64;
  const bin = globalThis.atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}
