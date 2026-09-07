// csprng.test.ts: guards the crypto.getRandomValues polyfill for ed25519 on Hermes.
// Hermes/React Native has no global WebCrypto, so @noble/curves throws
// "crypto.getRandomValues must be defined" in the APK — invisible in Node, which has
// crypto built in. The real shim (react-native-get-random-values) cannot be imported
// under Node/tsx (it pulls in React Native), so this test documents the contract that
// @proof/core depends on and fails in CI if the side-effect import is dropped from
// app/_layout.tsx. On-device confirmation is the rebuilt APK run (Worker M).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { generateKeyPair, signPayload, verifyProof } from "@proof/core";

const SHIM_IMPORT = 'import "react-native-get-random-values";';

test("the ed25519 contract: globalThis.crypto.getRandomValues is a function", () => {
  // Node satisfies this natively; on Hermes the _layout shim must provide it.
  assert.equal(typeof globalThis.crypto?.getRandomValues, "function");
});

test("generateKeyPair / signPayload / verifyProof round-trip with getRandomValues present", () => {
  const kp = generateKeyPair();
  const signed = signPayload(
    {
      proofHash: "a".repeat(64),
      taskId: "solar-panel-installation",
      geohash: "9q8yy",
      capturedAt: new Date().toISOString(),
    },
    kp.privateKey,
  );
  assert.equal(verifyProof(signed), true);
  assert.equal(verifyProof({ ...signed, geohash: "00000" }), false);
});

test("app/_layout.tsx keeps the shim as its first statement", () => {
  const layout = readFileSync(
    fileURLToPath(new URL("../app/_layout.tsx", import.meta.url)),
    "utf8",
  );
  const firstCode = layout
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0 && !l.startsWith("//"));
  assert.equal(firstCode, SHIM_IMPORT);
});
