// store-attestation-whitelist.test.ts: the store file is the one input store.ts does not
// produce itself, and /proof/:hash serves `attestations` as an array rather than picking
// fields out of it. So anything extra in a persisted attestation record reaches a public,
// unauthenticated endpoint.
//
// Verified against the previous code: a record carrying reporterPublicKey, preciseGps and
// volunteerName was served verbatim. load() re-validates `review` for exactly this reason
// ("a hand-edited or truncated file must not resurrect a review..."); attestations now get
// the same treatment.

import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { __setStorePathForTests, getProof } from "../src/store.js";

const HASH = "c".repeat(64);
const dirs: string[] = [];

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** Write a store file containing one proof with the given attestation records, then load it. */
function loadStoreWith(attestations: unknown): void {
  const dir = mkdtempSync(join(tmpdir(), "prufture-whitelist-"));
  dirs.push(dir);
  const path = join(dir, "store.json");
  writeFileSync(
    path,
    JSON.stringify({
      [HASH]: {
        payload: { proofHash: HASH, taskId: "t", geohash: "u4pru", capturedAt: "2026-01-01T00:00:00Z" },
        attestations,
      },
    }),
  );
  __setStorePathForTests(path);
}

test("extra keys in a persisted attestation record never survive the load", () => {
  loadStoreWith([
    {
      attester: "0xRELAYER",
      txHash: "0xTX",
      attestedAt: "2026-01-01T00:00:00Z",
      reporterPublicKey: "LEAKED_DEVICE_KEY",
      preciseGps: "-34.6037,-58.3816",
      volunteerName: "A Real Person",
      phone: "+5491100000000",
    },
  ]);

  const entry = getProof(HASH);
  assert.ok(entry, "the proof itself must still load");
  assert.equal(entry.attestations.length, 1);
  assert.deepEqual(Object.keys(entry.attestations[0]!).sort(), ["attestedAt", "attester", "txHash"]);

  const served = JSON.stringify(entry.attestations);
  for (const leak of ["LEAKED_DEVICE_KEY", "-34.6037", "A Real Person", "+5491100000000"]) {
    assert.ok(!served.includes(leak), `${leak} reached the public shape`);
  }
});

test("a well-formed record is preserved exactly", () => {
  loadStoreWith([{ attester: "0xA", txHash: "0xB", attestedAt: "2026-01-01T00:00:00Z" }]);
  assert.deepEqual(getProof(HASH)?.attestations, [
    { attester: "0xA", txHash: "0xB", attestedAt: "2026-01-01T00:00:00Z" },
  ]);
});

test("records missing the identifying fields are dropped, not half-loaded", () => {
  loadStoreWith([
    { txHash: "0xB", attestedAt: "x" },
    { attester: "0xA", attestedAt: "x" },
    { attester: 1, txHash: 2 },
    null,
    "not an object",
    [],
  ]);
  assert.deepEqual(getProof(HASH)?.attestations, []);
});

test("a missing attestedAt becomes an empty string rather than undefined", () => {
  loadStoreWith([{ attester: "0xA", txHash: "0xB" }]);
  assert.deepEqual(getProof(HASH)?.attestations, [{ attester: "0xA", txHash: "0xB", attestedAt: "" }]);
});

test("a non-array attestations field loads as empty", () => {
  for (const bogus of [null, undefined, {}, "x", 7]) {
    loadStoreWith(bogus);
    assert.deepEqual(getProof(HASH)?.attestations, [], `${JSON.stringify(bogus)} must load as []`);
  }
});

test("one malformed record does not discard the valid ones beside it", () => {
  loadStoreWith([
    { attester: "0xA", txHash: "0x1", attestedAt: "x", leaked: "SECRET" },
    null,
    { attester: "0xB", txHash: "0x2", attestedAt: "y" },
  ]);
  const got = getProof(HASH)?.attestations ?? [];
  assert.equal(got.length, 2);
  assert.ok(!JSON.stringify(got).includes("SECRET"));
});
