// store-isolation.test.ts: regression cover for a cross-run state leak — pid-only store names were
// recycled across runs and loaded a previous run's proofs, flaking "unknown proofHash => 404".
// Pins the fix: the path is unique per run, and the process removes its own file on exit.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const storeUrl = pathToFileURL(resolve(here, "../src/store.ts")).href;

/** Run a snippet in a child process that believes it is under `node --test`. */
function inTestProcess(script: string): string {
  return execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], {
    encoding: "utf8",
    env: { ...process.env, NODE_TEST_CONTEXT: "1", STORE_PATH: "" },
  });
}

test("the test store path carries a random component, not just the pid", () => {
  // Report the chosen path directly rather than scanning tmpdir: the directory may still hold
  // pid-only files left by older builds, and those are not what this asserts.
  const script = `
    import { __storePathForTests } from ${JSON.stringify(storeUrl)};
    console.log(__storePathForTests());
  `;
  const paths = [inTestProcess(script).trim(), inTestProcess(script).trim()];
  for (const p of paths) {
    const name = p.split(/[/\\]/).pop() ?? "";
    assert.doesNotMatch(name, /^prufture-store-test-\d+\.json$/, `${name} is named by pid alone`);
    assert.match(name, /^prufture-store-test-\d+-[0-9a-f-]{36}\.json$/, `${name} lacks a random component`);
  }
  assert.notEqual(paths[0], paths[1], "two runs must never share a store file name");
});

test("a test process removes its own store file on exit", () => {
  const script = `
    import { upsertProof, __storePathForTests } from ${JSON.stringify(storeUrl)};
    upsertProof({ proofHash: "b".repeat(64), taskId: "t", geohash: "u4pru", capturedAt: "2026-01-01T00:00:00Z" });
    console.log(__storePathForTests());
  `;
  const path = inTestProcess(script).trim().split("\n").pop() ?? "";
  assert.ok(path.length > 0, "the child must report its store path");
  assert.equal(existsSync(path), false, `${path} survived the process that created it`);
});

test("a fresh test process never sees another process's proofs", () => {
  const writer = `
    import { upsertProof, __storePathForTests } from ${JSON.stringify(storeUrl)};
    upsertProof({ proofHash: "f".repeat(64), taskId: "t", geohash: "u4pru", capturedAt: "2026-01-01T00:00:00Z" });
    console.log(__storePathForTests());
  `;
  inTestProcess(writer);

  const reader = `
    import { getProof } from ${JSON.stringify(storeUrl)};
    console.log(getProof("f".repeat(64)) ? "LEAKED" : "CLEAN");
  `;
  for (let i = 0; i < 3; i++) {
    assert.match(inTestProcess(reader), /CLEAN/, "a previous process's proof leaked into a fresh store");
  }
});

test("STORE_PATH still wins when it is set", () => {
  const explicit = join(tmpdir(), `prufture-explicit-${Date.now()}.json`);
  const script = `
    import { __storePathForTests } from ${JSON.stringify(storeUrl)};
    console.log(__storePathForTests());
  `;
  const out = execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], {
    encoding: "utf8",
    env: { ...process.env, NODE_TEST_CONTEXT: "1", STORE_PATH: explicit },
  });
  assert.match(out, new RegExp(explicit.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});
