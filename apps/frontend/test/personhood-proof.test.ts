// personhood-proof.test.ts: the programme-pass flow after sync. Flag off or prover missing means no
// call at all; every api state maps to one outcome; every failure is "unavailable"; the client scope
// equals the api's expectedScope(). Pure: fetch, prover and identity are injected.

import { test } from "node:test";
import assert from "node:assert/strict";
import { Identity } from "@semaphore-protocol/identity";
import { expectedScope, POLICY_VERSION as API_POLICY_VERSION } from "../../api/src/personhood";
import { personhoodProgrammeId, personhoodProvider, type PersonhoodProvider } from "../src/flags";
import {
  attachPersonhoodProof,
  personhoodActive,
  personhoodScope,
  POLICY_VERSION,
  toOutcome,
  type PersonhoodDeps,
} from "../src/personhood-proof";
import { BENCH_COMMITMENTS, BENCH_PRIVATE_KEY, BENCH_SCOPE } from "../src/zk-bench-fixture";

const member = new Identity(BENCH_PRIVATE_KEY);
const PROOF_HASH = `0x${"ab".repeat(32)}`;
const REQ = { proofHash: PROOF_HASH, taskId: "item:solar-fridge", programmeId: "pilot-1" };
const RAW = { points: Array.from({ length: 8 }, (_, i) => String(i + 1)), publicSignals: ["11", "22", "33", "44"] };

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

interface Calls {
  urls: string[];
  bodies: unknown[];
  proves: number;
  identities: number;
}

function makeDeps(
  opts: {
    provider?: PersonhoodProvider;
    available?: boolean;
    group?: () => Response;
    proof?: () => Response;
    prove?: () => Promise<typeof RAW>;
    identity?: Identity;
  } = {},
): { deps: PersonhoodDeps; calls: Calls } {
  const calls: Calls = { urls: [], bodies: [], proves: 0, identities: 0 };
  const id = opts.identity ?? member;
  const deps: PersonhoodDeps = {
    apiUrl: "http://api.test/",
    provider: () => opts.provider ?? "semaphore",
    proverAvailable: () => opts.available ?? true,
    prove: async () => {
      calls.proves += 1;
      return opts.prove ? opts.prove() : RAW;
    },
    getIdentity: async () => {
      calls.identities += 1;
      return { secretScalar: id.secretScalar, commitment: id.commitment };
    },
    fetchImpl: (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.urls.push(url);
      if (init?.body) calls.bodies.push(JSON.parse(String(init.body)));
      if (url.includes("/personhood/group/")) {
        return opts.group ? opts.group() : json(200, { programmeId: "pilot-1", epoch: 1, commitments: BENCH_COMMITMENTS, root: "1" });
      }
      if (url.endsWith("/personhood/proof")) return opts.proof ? opts.proof() : json(200, { state: "verified" });
      throw new Error(`unexpected url ${url}`);
    }) as unknown as typeof fetch,
  };
  return { deps, calls };
}

test("flag off: no fetch, no identity read, no proving; outcome unavailable", async () => {
  const { deps, calls } = makeDeps({ provider: "off" });
  assert.equal(await attachPersonhoodProof(REQ, deps), "unavailable");
  assert.deepEqual(calls, { urls: [], bodies: [], proves: 0, identities: 0 });
});

test("prover module missing (Expo Go, Android): no call at all; outcome unavailable", async () => {
  const { deps, calls } = makeDeps({ available: false });
  assert.equal(await attachPersonhoodProof(REQ, deps), "unavailable");
  assert.deepEqual(calls, { urls: [], bodies: [], proves: 0, identities: 0 });
});

test("personhoodActive needs both the flag and the prover", () => {
  assert.equal(personhoodActive("off", true), false);
  assert.equal(personhoodActive("off", false), false);
  assert.equal(personhoodActive("semaphore", false), false);
  assert.equal(personhoodActive("semaphore", true), true);
});

test("flag reads exactly 'semaphore'; default and anything else is off", () => {
  const prev = process.env.EXPO_PUBLIC_PERSONHOOD_PROVIDER;
  try {
    delete process.env.EXPO_PUBLIC_PERSONHOOD_PROVIDER;
    assert.equal(personhoodProvider(), "off");
    for (const v of ["off", "Semaphore", "on", ""]) {
      process.env.EXPO_PUBLIC_PERSONHOOD_PROVIDER = v;
      assert.equal(personhoodProvider(), "off");
    }
    process.env.EXPO_PUBLIC_PERSONHOOD_PROVIDER = "semaphore";
    assert.equal(personhoodProvider(), "semaphore");
  } finally {
    if (prev === undefined) delete process.env.EXPO_PUBLIC_PERSONHOOD_PROVIDER;
    else process.env.EXPO_PUBLIC_PERSONHOOD_PROVIDER = prev;
  }
});

test("programme id: null when unset or malformed", () => {
  const prev = process.env.EXPO_PUBLIC_PERSONHOOD_PROGRAMME_ID;
  try {
    delete process.env.EXPO_PUBLIC_PERSONHOOD_PROGRAMME_ID;
    assert.equal(personhoodProgrammeId(), null);
    process.env.EXPO_PUBLIC_PERSONHOOD_PROGRAMME_ID = "Pilot 1";
    assert.equal(personhoodProgrammeId(), null);
    process.env.EXPO_PUBLIC_PERSONHOOD_PROGRAMME_ID = "pilot-1";
    assert.equal(personhoodProgrammeId(), "pilot-1");
  } finally {
    if (prev === undefined) delete process.env.EXPO_PUBLIC_PERSONHOOD_PROGRAMME_ID;
    else process.env.EXPO_PUBLIC_PERSONHOOD_PROGRAMME_ID = prev;
  }
});

for (const state of ["verified", "invalid", "reused", "unavailable"] as const) {
  test(`api state "${state}" maps to outcome "${state}"`, async () => {
    const { deps } = makeDeps({ proof: () => json(200, { state }) });
    assert.equal(await attachPersonhoodProof(REQ, deps), state);
  });
}

test("posts the report hash, programme and a proof bound to hash and api scope", async () => {
  const { deps, calls } = makeDeps();
  assert.equal(await attachPersonhoodProof(REQ, deps), "verified");
  assert.deepEqual(calls.urls, ["http://api.test/personhood/group/pilot-1", "http://api.test/personhood/proof"]);
  const body = calls.bodies[0] as { proofHash: string; programmeId: string; proof: Record<string, unknown> };
  assert.equal(body.proofHash, PROOF_HASH);
  assert.equal(body.programmeId, "pilot-1");
  assert.equal(body.proof.message, BigInt(PROOF_HASH).toString());
  assert.equal(body.proof.scope, BENCH_SCOPE);
  assert.deepEqual(body.proof.points, RAW.points);
  // The secret never goes on the wire.
  assert.ok(!JSON.stringify(body).includes(member.secretScalar.toString()));
  assert.ok(!JSON.stringify(body).includes(member.export()));
});

test("every failure path is unavailable and never throws", async () => {
  const cases: Record<string, Parameters<typeof makeDeps>[0]> = {
    "group 404": { group: () => json(404, { error: "unknown programme" }) },
    "group bad epoch": { group: () => json(200, { epoch: "1", commitments: BENCH_COMMITMENTS }) },
    "group bad commitments": { group: () => json(200, { epoch: 1, commitments: [1, 2] }) },
    "group fetch throws": { group: () => { throw new Error("offline"); } },
    "not enrolled": { identity: new Identity("someone-else") },
    "prover throws": { prove: async () => { throw new Error("prover crashed"); } },
    "proof 404": { proof: () => json(404, { error: "unknown proofHash" }) },
    "proof 500": { proof: () => json(500, { error: "boom" }) },
    "unknown state": { proof: () => json(200, { state: "maybe" }) },
    "non-json body": { proof: () => new Response("<html>", { status: 200 }) },
  };
  for (const [name, opts] of Object.entries(cases)) {
    const { deps } = makeDeps(opts);
    assert.equal(await attachPersonhoodProof(REQ, deps), "unavailable", name);
  }
});

test("missing programme id or malformed hash: unavailable with no network call", async () => {
  for (const req of [{ ...REQ, programmeId: null }, { ...REQ, proofHash: "0x1234" }, { ...REQ, taskId: "" }]) {
    const { deps, calls } = makeDeps();
    assert.equal(await attachPersonhoodProof(req, deps), "unavailable");
    assert.equal(calls.urls.length, 0);
  }
});

test("toOutcome: only the four known states pass through", () => {
  assert.equal(toOutcome({ state: "reused" }), "reused");
  assert.equal(toOutcome({ state: "VERIFIED" }), "unavailable");
  assert.equal(toOutcome(null), "unavailable");
  assert.equal(toOutcome("verified"), "unavailable");
});

test("client scope equals the api's expectedScope() (TODO: server GET /personhood/scope)", () => {
  assert.equal(POLICY_VERSION, API_POLICY_VERSION);
  const cases: [string, string, bigint][] = [
    ["pilot-1", "item:solar-fridge", 1n],
    ["pilot-1", "item:solar-fridge", 2n],
    ["a", "", 1n],
    ["x".repeat(64), "task-with-a-long-id-that-spans-more-than-one-abi-word-of-32-bytes", 99n],
    ["prog", "tâche-école-ünïcode", 7n],
  ];
  for (const [programmeId, taskId, epoch] of cases) {
    assert.equal(
      personhoodScope(programmeId, taskId, epoch),
      expectedScope({ programmeId, taskId, epoch, policyVersion: API_POLICY_VERSION }),
      `${programmeId}/${taskId}/${epoch}`,
    );
  }
  assert.equal(personhoodScope("pilot-1", "item:solar-fridge", 1n).toString(), BENCH_SCOPE);
});
