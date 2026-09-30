// personhood-api-contract.test.ts: the app's programme-pass client against the REAL api routes
// (apps/api app.request, no stubbed responses), so every URL, query and body shape the phone uses
// is proven to exist on the server. Only the native prover is replaced.

import { after, afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Identity } from "@semaphore-protocol/identity";
import { app } from "../../api/src/index";
import * as store from "../../api/src/store";
import { closePersonhoodVerifier, enrolCommitment, expectedScope, POLICY_VERSION } from "../../api/src/personhood";
import { attachPersonhoodProof, checkEnrolment, type PersonhoodDeps } from "../src/personhood-proof";
import { BENCH_COMMITMENTS, BENCH_PRIVATE_KEY } from "../src/zk-bench-fixture";

const fx = JSON.parse(readFileSync(new URL("../../api/test/fixtures/semaphore-proofs.json", import.meta.url), "utf8"));
const BASE = "http://api.test";
const PROGRAMME = "pilot-1";
const TASK = "item:solar-fridge";
const HASH = fx.hashes.one as string;
const member = new Identity(BENCH_PRIVATE_KEY);

after(closePersonhoodVerifier);
afterEach(() => {
  delete process.env.PERSONHOOD_PROVIDER;
});

function fresh(): void {
  store.__setStorePathForTests(join(tmpdir(), `prufture-pass-contract-${randomUUID()}.json`));
  let g;
  for (const c of BENCH_COMMITMENTS) g = enrolCommitment(g, c).group;
  store.putPersonhoodGroup(PROGRAMME, g!);
  store.upsertProof({ proofHash: HASH, taskId: TASK, geohash: "9q8yy", capturedAt: "2026-09-06T14:32:00.000Z" });
}

function deps(urls: string[], bodies: unknown[]): PersonhoodDeps {
  return {
    apiUrl: `${BASE}/`,
    provider: () => "semaphore",
    proverAvailable: () => true,
    // A real curve point set from the api fixtures; the depth-10 key rejects it, so the api's real
    // Groth16 check answers "invalid" rather than the test deciding the outcome.
    prove: async () => ({
      points: fx.first.points,
      publicSignals: [fx.first.merkleTreeRoot, fx.first.nullifier, "0", "0"],
    }),
    getIdentity: async () => ({ secretScalar: member.secretScalar, commitment: member.commitment }),
    fetchImpl: (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      assert.ok(url.startsWith(BASE), url);
      urls.push(url);
      if (init?.body) bodies.push(JSON.parse(String(init.body)));
      return app.request(url.slice(BASE.length), init);
    }) as unknown as typeof fetch,
  };
}

test("every request the phone makes hits a real route; the posted scope is the api's own", async () => {
  fresh();
  process.env.PERSONHOOD_PROVIDER = "semaphore";
  const urls: string[] = [];
  const bodies: unknown[] = [];
  const outcome = await attachPersonhoodProof({ proofHash: HASH, taskId: TASK, programmeId: PROGRAMME }, deps(urls, bodies));
  assert.equal(outcome, "invalid");
  assert.deepEqual(urls, [
    `${BASE}/proof/${HASH}`,
    `${BASE}/personhood/scope?programmeId=${PROGRAMME}&proofHash=${HASH}`,
    `${BASE}/personhood/group/${PROGRAMME}`,
    `${BASE}/personhood/proof`,
  ]);
  const posted = bodies[0] as { proof: { scope: string; message: string } };
  const apiScope = expectedScope({ programmeId: PROGRAMME, taskId: TASK, epoch: 1n, policyVersion: POLICY_VERSION });
  assert.equal(posted.proof.scope, apiScope.toString());
  assert.equal(posted.proof.message, BigInt(HASH).toString());
});

test("a report the api already accepted is verified with no new proof", async () => {
  fresh();
  process.env.PERSONHOOD_PROVIDER = "semaphore";
  store.setMembershipVerified(HASH);
  const urls: string[] = [];
  const outcome = await attachPersonhoodProof({ proofHash: HASH, taskId: TASK, programmeId: PROGRAMME }, deps(urls, []));
  assert.equal(outcome, "verified");
  assert.deepEqual(urls, [`${BASE}/proof/${HASH}`]);
});

test("pass off on the api: the real route answers unavailable", async () => {
  fresh();
  const outcome = await attachPersonhoodProof({ proofHash: HASH, taskId: TASK, programmeId: PROGRAMME }, deps([], []));
  assert.equal(outcome, "unavailable");
});

test("report not on the api yet: unavailable, nothing proved or posted", async () => {
  fresh();
  process.env.PERSONHOOD_PROVIDER = "semaphore";
  const urls: string[] = [];
  const other = fx.hashes.three as string;
  const outcome = await attachPersonhoodProof({ proofHash: other, taskId: TASK, programmeId: PROGRAMME }, deps(urls, []));
  assert.equal(outcome, "unavailable");
  assert.deepEqual(urls, [`${BASE}/proof/${other}`]);
});

test("checkEnrolment reads the real group route, including its 'no group yet' 404", async () => {
  fresh();
  const urls: string[] = [];
  const f = deps(urls, []).fetchImpl;
  assert.equal(await checkEnrolment(BASE, PROGRAMME, member.commitment.toString(), f), "enrolled");
  assert.equal(await checkEnrolment(BASE, PROGRAMME, "12345", f), "not_enrolled");
  assert.equal(await checkEnrolment(BASE, "pilot-2", member.commitment.toString(), f), "not_enrolled");
  assert.deepEqual(urls, [
    `${BASE}/personhood/group/${PROGRAMME}`,
    `${BASE}/personhood/group/${PROGRAMME}`,
    `${BASE}/personhood/group/pilot-2`,
  ]);
});
