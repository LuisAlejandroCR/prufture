// personhood-proof.test.ts: the programme-pass flow after sync. Flag off or prover missing means no
// call at all; every api state maps to one outcome; every failure is "unavailable"; the scope is read
// from GET /personhood/scope, never computed here. Pure: fetch, prover and identity are injected.

import { test } from "node:test";
import assert from "node:assert/strict";
import { Identity } from "@semaphore-protocol/identity";
import { personhoodProgrammeId, personhoodProvider, type PersonhoodProvider } from "../src/flags";
import {
  attachPersonhoodProof,
  checkEnrolment,
  parseScope,
  personhoodActive,
  scopeUrl,
  toOutcome,
  type PersonhoodDeps,
} from "../src/personhood-proof";
import { BENCH_COMMITMENTS, BENCH_PRIVATE_KEY, BENCH_SCOPE } from "../src/zk-bench-fixture";

const member = new Identity(BENCH_PRIVATE_KEY);
const PROOF_HASH = `0x${"ab".repeat(32)}`;
const REQ = { proofHash: PROOF_HASH, taskId: "item:solar-fridge", programmeId: "pilot-1" };
const SCOPE_URL = `http://api.test/personhood/scope?programmeId=pilot-1&proofHash=${PROOF_HASH}`;
const EXPECTED_URLS = [
  `http://api.test/proof/${PROOF_HASH}`,
  SCOPE_URL,
  "http://api.test/personhood/group/pilot-1",
  "http://api.test/personhood/proof",
];
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
    report?: () => Response;
    scope?: () => Response;
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
      if (url === `http://api.test/proof/${PROOF_HASH}`) {
        return opts.report ? opts.report() : json(200, { proofHash: PROOF_HASH, membership: null });
      }
      if (url === SCOPE_URL) return opts.scope ? opts.scope() : json(200, { scope: BENCH_SCOPE, epoch: 1 });
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

test("reads the report, then the api scope, then the group, then posts: exact endpoints", async () => {
  const { deps, calls } = makeDeps();
  assert.equal(await attachPersonhoodProof(REQ, deps), "verified");
  assert.deepEqual(calls.urls, EXPECTED_URLS);
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
    "report 404": { report: () => json(404, { error: "not found" }) },
    "report fetch throws": { report: () => { throw new Error("offline"); } },
    "scope 404": { scope: () => json(404, { error: "unknown proofHash" }) },
    "scope 500": { scope: () => json(500, { error: "boom" }) },
    "scope not a decimal string": { scope: () => json(200, { scope: 42, epoch: 1 }) },
    "scope outside the field": { scope: () => json(200, { scope: "9".repeat(78), epoch: 1 }) },
    "scope missing epoch": { scope: () => json(200, { scope: BENCH_SCOPE }) },
    "scope fetch throws": { scope: () => { throw new Error("offline"); } },
    "epoch moved between reads": { scope: () => json(200, { scope: BENCH_SCOPE, epoch: 2 }) },
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

test("already accepted on the api: verified without reading the identity or proving", async () => {
  const { deps, calls } = makeDeps({ report: () => json(200, { proofHash: PROOF_HASH, membership: "verified" }) });
  assert.equal(await attachPersonhoodProof(REQ, deps), "verified");
  assert.deepEqual(calls.urls, [`http://api.test/proof/${PROOF_HASH}`]);
  assert.equal(calls.proves, 0);
  assert.equal(calls.identities, 0);
});

test("the proof carries the scope the api returned, whatever the task id says", async () => {
  const other = "123456789";
  const { deps, calls } = makeDeps({ scope: () => json(200, { scope: other, epoch: 1 }) });
  await attachPersonhoodProof(REQ, deps);
  const body = calls.bodies[0] as { proof: { scope: string } };
  assert.equal(body.proof.scope, other);
});

test("scopeUrl: exact path and encoded query, trailing slashes dropped", () => {
  assert.equal(scopeUrl("http://api.test///", "pilot-1", PROOF_HASH), SCOPE_URL);
  assert.equal(
    scopeUrl("http://api.test", "a b&c", "0x12"),
    "http://api.test/personhood/scope?programmeId=a%20b%26c&proofHash=0x12",
  );
});

test("parseScope: decimal string inside the field plus an integer epoch >= 1", () => {
  assert.deepEqual(parseScope({ scope: BENCH_SCOPE, epoch: 3 }), { scope: BigInt(BENCH_SCOPE), epoch: 3 });
  for (const bad of [
    null,
    {},
    { scope: "0x12", epoch: 1 },
    { scope: "-1", epoch: 1 },
    { scope: "1.5", epoch: 1 },
    { scope: "12", epoch: 0 },
    { scope: "12", epoch: 1.5 },
    { scope: "21888242871839275222246405745257275088548364400416034343698204186575808495617", epoch: 1 },
  ]) {
    assert.equal(parseScope(bad), null, JSON.stringify(bad));
  }
});

test("checkEnrolment: on the list, not on it, no group yet, and every failure", async () => {
  const commitment = member.commitment.toString();
  const answer = (res: () => Response) => {
    const urls: string[] = [];
    const f = (async (input: RequestInfo | URL) => {
      urls.push(String(input));
      return res();
    }) as unknown as typeof fetch;
    return { f, urls };
  };
  const on = answer(() => json(200, { epoch: 1, commitments: BENCH_COMMITMENTS }));
  assert.equal(await checkEnrolment("http://api.test/", "pilot-1", commitment, on.f), "enrolled");
  assert.deepEqual(on.urls, ["http://api.test/personhood/group/pilot-1"]);
  const off = answer(() => json(200, { epoch: 1, commitments: ["1", "2"] }));
  assert.equal(await checkEnrolment("http://api.test", "pilot-1", commitment, off.f), "not_enrolled");
  const none = answer(() => json(404, { error: "unknown programme" }));
  assert.equal(await checkEnrolment("http://api.test", "pilot-1", commitment, none.f), "not_enrolled");
  const proxy404 = answer(() => new Response("Not Found", { status: 404 }));
  assert.equal(await checkEnrolment("http://api.test", "pilot-1", commitment, proxy404.f), "unknown");
  const down = answer(() => json(503, {}));
  assert.equal(await checkEnrolment("http://api.test", "pilot-1", commitment, down.f), "unknown");
  const throws = answer(() => { throw new Error("offline"); });
  assert.equal(await checkEnrolment("http://api.test", "pilot-1", commitment, throws.f), "unknown");
  const unset = answer(() => json(200, {}));
  assert.equal(await checkEnrolment("http://api.test", null, commitment, unset.f), "unknown");
  assert.equal(unset.urls.length, 0);
});
