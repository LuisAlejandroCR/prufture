// csprng.test.ts: guards the crypto.getRandomValues contract ed25519 needs on Hermes, which has no
// WebCrypto (invisible under Node). The real shim cannot load under Node, so this fails CI instead
// if the react-native-get-random-values side-effect import is dropped from app/_layout.tsx.

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
