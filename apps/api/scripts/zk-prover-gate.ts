// zk-prover-gate.ts: host gate for the Rust prover. Builds circuit inputs in JS exactly as
// @semaphore-protocol/proof does, proves with packages/zk-prover (PROVE_CLI binary, else Docker), and
// checks the result with the api's own verifier. Test keys only; run: [PROVE_CLI=<path>] npx tsx scripts/zk-prover-gate.ts

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { Identity } from "@semaphore-protocol/identity";
import { verifyProof, type SemaphoreProof } from "@semaphore-protocol/proof";
import {
  closePersonhoodVerifier,
  enrolCommitment,
  expectedScope,
  memoryNullifierStore,
  verifyMembership,
} from "../src/personhood.js";

const DEPTH = 10; // must equal CIRCUIT_DEPTH in apps/frontend/src/personhood-inputs.ts
const here = dirname(fileURLToPath(import.meta.url));
const crateDir = resolve(here, "../../../packages/zk-prover");
const fx = JSON.parse(readFileSync(resolve(here, "../test/fixtures/semaphore-proofs.json"), "utf8"));

// Loaded at runtime: the app's builder lives outside this workspace's tsconfig rootDir.
type BuildCircuitInputs = (a: {
  secretScalar: bigint;
  commitment: bigint;
  commitments: readonly string[];
  message: bigint;
  scope: bigint;
}) => { inputs: object; root: string };
const builderPath = pathToFileURL(resolve(here, "../../frontend/src/personhood-inputs.ts")).href;
const { buildCircuitInputs } = (await import(builderPath)) as { buildCircuitInputs: BuildCircuitInputs };

const identity = new Identity("prufture-test-alpha"); // fixture member 0
const scope = expectedScope({ ...fx.scopes.A, epoch: 1n, policyVersion: 1n });
const message = BigInt(fx.hashes.one);
// The app's own builder: this gate also proves its inputs are what the circuit expects.
const { inputs, root } = buildCircuitInputs({
  secretScalar: identity.secretScalar,
  commitment: identity.commitment,
  commitments: fx.commitments,
  message,
  scope,
});

const zkeyRel = "artifacts/semaphore-10.zkey";
// PROVE_CLI runs a natively built prove-cli directly; without it the Linux build runs in Docker.
const proveCli = process.env.PROVE_CLI;
const [cmd, args] = proveCli
  ? [proveCli, [resolve(crateDir, zkeyRel)]]
  : [
      "docker",
      [
        "run", "--rm", "-i",
        "-v", `${crateDir}:/src`,
        "-v", "prufture-zk-target:/target",
        "rust:1", "/target/release/prove-cli", `/src/${zkeyRel}`,
      ],
    ];

const t0 = Date.now();
const out = execFileSync(cmd, args, {
  input: JSON.stringify(inputs),
  env: { ...process.env, MSYS_NO_PATHCONV: "1" },
  stdio: ["pipe", "pipe", "inherit"],
}).toString();
const wallMs = Date.now() - t0;
// circom-witnesscalc prints timing lines on stdout; the proof is the last line.
const { points, publicSignals } = JSON.parse(out.trim().split(/\r?\n/).at(-1)!) as { points: string[]; publicSignals: string[] };

const proof: SemaphoreProof = {
  merkleTreeDepth: DEPTH,
  merkleTreeRoot: root as `${number}`,
  nullifier: publicSignals[1] as `${number}`,
  message: message.toString() as `${number}`,
  scope: scope.toString() as `${number}`,
  points: points as SemaphoreProof["points"],
};

let enrolled;
for (const c of fx.commitments) enrolled = enrolCommitment(enrolled, c).group;

const checks = {
  rootMatchesPublicSignal: publicSignals[0] === proof.merkleTreeRoot,
  nullifierMatchesJsFixture: proof.nullifier === fx.first.nullifier,
  jsVerifyProof: await verifyProof(proof),
  apiVerifyMembership: (
    await verifyMembership(
      { proof, proofHash: fx.hashes.one, scope, acceptedRoots: enrolled!.roots },
      { nullifiers: memoryNullifierStore(), enabled: () => true },
    )
  ).state,
};
await closePersonhoodVerifier();
console.log(JSON.stringify({ depth: DEPTH, prover: proveCli ? "native" : "docker", proveWallMs: wallMs, checks }, null, 2));
const pass =
  checks.rootMatchesPublicSignal && checks.nullifierMatchesJsFixture && checks.jsVerifyProof && checks.apiVerifyMembership === "verified";
console.log(pass ? "GATE PASS" : "GATE FAIL");
process.exit(pass ? 0 : 1);
