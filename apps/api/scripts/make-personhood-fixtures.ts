// make-personhood-fixtures.ts: one-off — generates real Semaphore v4 proofs for the personhood
// tests so `npm test` never downloads circuit artifacts. Needs network once (the prover fetches
// the depth-N wasm/zkey); the fixed private keys are test-only and identify nobody.

import { writeFileSync } from "node:fs";
import { Group } from "@semaphore-protocol/group";
import { Identity } from "@semaphore-protocol/identity";
import { generateProof } from "@semaphore-protocol/proof";
import { expectedScope } from "../src/personhood.js";

const members = ["alpha", "bravo", "charlie", "delta", "echo"].map((k) => new Identity(`prufture-test-${k}`));
const group = new Group(members.map((m) => m.commitment));

const scopeA = { programmeId: "pilot-1", taskId: "item:solar-fridge", epoch: 1n, policyVersion: 1n };
const scopeB = { ...scopeA, taskId: "item:handwashing-station" };
const hashes = {
  one: `0x${"11".repeat(32)}`,
  two: `0x${"22".repeat(32)}`,
  three: `0x${"33".repeat(32)}`,
};

const prove = (who: Identity, hash: string, scope: bigint) => generateProof(who, group, hash, scope);
const [m0, , , m3] = members as [Identity, Identity, Identity, Identity, Identity];

const sA = expectedScope(scopeA);
const sB = expectedScope(scopeB);
const fixtures = {
  root: group.root.toString(),
  commitments: members.map((m) => m.commitment.toString()),
  scopes: {
    A: { ...scopeA, epoch: "1", policyVersion: "1" },
    B: { ...scopeB, epoch: "1", policyVersion: "1" },
  },
  hashes,
  // member 0, task A, report one
  first: await prove(m0, hashes.one, sA),
  // member 0 again, same task A, a different report -> same nullifier
  sameMemberSameScope: await prove(m0, hashes.two, sA),
  // member 0, task B -> different nullifier
  sameMemberOtherScope: await prove(m0, hashes.three, sB),
  // member 3, task A -> verified alongside member 0
  otherMember: await prove(m3, hashes.three, sA),
};

const out = new URL("../test/fixtures/semaphore-proofs.json", import.meta.url);
writeFileSync(out, JSON.stringify(fixtures, null, 2) + "\n");
console.log(`wrote ${out.pathname} (depth ${fixtures.first.merkleTreeDepth})`);
process.exit(0);
