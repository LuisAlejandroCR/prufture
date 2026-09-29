// zk-prover-gate.ts: host gate for the Rust prover. Builds circuit inputs in JS exactly as
// @semaphore-protocol/proof does, proves with packages/zk-prover (Docker, Linux build), and checks
// the result with the api's own verifier. Test keys only; run: npx tsx scripts/zk-prover-gate.ts

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { Group } from "@semaphore-protocol/group";
import { Identity } from "@semaphore-protocol/identity";
import { verifyProof, type SemaphoreProof } from "@semaphore-protocol/proof";
import { keccak256, toHex } from "viem";
import {
  closePersonhoodVerifier,
  enrolCommitment,
  expectedScope,
  memoryNullifierStore,
  verifyMembership,
} from "../src/personhood.js";

const DEPTH = 10;
const here = dirname(fileURLToPath(import.meta.url));
const crateDir = resolve(here, "../../../packages/zk-prover");
const fx = JSON.parse(readFileSync(resolve(here, "../test/fixtures/semaphore-proofs.json"), "utf8"));

/** Semaphore's field hash for message and scope: keccak256(32-byte big-endian) >> 8. */
const semaphoreHash = (x: bigint) => (BigInt(keccak256(toHex(x, { size: 32 }))) >> 8n).toString();

const identity = new Identity("prufture-test-alpha"); // fixture member 0
const group = new Group(fx.commitments.map(BigInt));
const merkle = group.generateMerkleProof(group.indexOf(identity.commitment));
const scope = expectedScope({ ...fx.scopes.A, epoch: 1n, policyVersion: 1n });
const message = BigInt(fx.hashes.one);

const siblings = [...merkle.siblings.map(String)];
while (siblings.length < DEPTH) siblings.push("0");
const inputs = {
  secret: identity.secretScalar.toString(),
  merkleProofLength: merkle.siblings.length,
  merkleProofIndex: merkle.index,
  merkleProofSiblings: siblings,
  scope: semaphoreHash(scope),
  message: semaphoreHash(message),
};

const t0 = Date.now();
const out = execFileSync(
  "docker",
  [
    "run", "--rm", "-i",
    "-v", `${crateDir}:/src`,
    "-v", "prufture-zk-target:/target",
    "rust:1", "/target/release/prove-cli", "/src/artifacts/semaphore-10.zkey",
  ],
  { input: JSON.stringify(inputs), env: { ...process.env, MSYS_NO_PATHCONV: "1" }, stdio: ["pipe", "pipe", "inherit"] },
).toString();
const wallMs = Date.now() - t0;
// circom-witnesscalc prints timing lines on stdout; the proof is the last line.
const { points, publicSignals } = JSON.parse(out.trim().split(/\r?\n/).at(-1)!) as { points: string[]; publicSignals: string[] };

const proof: SemaphoreProof = {
  merkleTreeDepth: DEPTH,
  merkleTreeRoot: merkle.root.toString() as `${number}`,
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
console.log(JSON.stringify({ depth: DEPTH, dockerWallMs: wallMs, checks }, null, 2));
const pass =
  checks.rootMatchesPublicSignal && checks.nullifierMatchesJsFixture && checks.jsVerifyProof && checks.apiVerifyMembership === "verified";
console.log(pass ? "GATE PASS" : "GATE FAIL");
process.exit(pass ? 0 : 1);
