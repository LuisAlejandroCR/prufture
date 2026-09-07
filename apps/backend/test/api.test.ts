// api.test.ts: unit + fuzz + invariant tests for the /verify + /dashboard data layer.
// Proves: region coarsening can never widen or diverge from the input, and every fetch
// helper maps transport outcomes to an honest state without throwing.

import { test } from "node:test";
import assert from "node:assert/strict";
import { toRegion, fetchProof, fetchProofs, REGION_PREFIX_LEN } from "../lib/api.js";

const realFetch = globalThis.fetch;
function stub(fn: (url: string) => { status: number; json?: unknown }) {
  globalThis.fetch = (async (url: string | URL) => {
    const { status, json } = fn(String(url));
    return new Response(json === undefined ? "" : JSON.stringify(json), {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
}
function restore() {
  globalThis.fetch = realFetch;
}

const rand = (n: number) => Math.floor(Math.random() * n);
const geohashish = (len = rand(15)) =>
  Array.from({ length: len }, () => "0123456789bcdefghjkmnpqrstuvwxyz"[rand(32)]).join("");

test("toRegion: unit vectors", () => {
  assert.equal(toRegion("9q8yyk8yuv"), "9q8yy");
  assert.equal(toRegion(""), "");
  assert.equal(toRegion(undefined), "");
  assert.equal(toRegion("ab"), "ab");
});

test("invariant (fuzz): region is a prefix of the input and never longer than REGION_PREFIX_LEN", () => {
  for (let i = 0; i < 2000; i++) {
    const g = geohashish();
    const r = toRegion(g);
    assert.ok(r.length <= REGION_PREFIX_LEN);
    assert.ok(g.startsWith(r));
    assert.equal(r, g.slice(0, REGION_PREFIX_LEN));
  }
});

test("fetchProof: 404 → not_found, 5xx → unreachable, network throw → unreachable", async () => {
  try {
    stub(() => ({ status: 404 }));
    assert.equal((await fetchProof("x")).state, "not_found");
    stub(() => ({ status: 503 }));
    assert.equal((await fetchProof("x")).state, "unreachable");
    globalThis.fetch = (async () => {
      throw new Error("ECONNREFUSED");
    }) as typeof fetch;
    assert.equal((await fetchProof("x")).state, "unreachable");
  } finally {
    restore();
  }
});

test("invariant: fetchProof never surfaces a full geohash, only a <=5 char region", async () => {
  try {
    for (let i = 0; i < 200; i++) {
      const full = geohashish(8 + rand(6)) + "wxyz"; // always longer than the region prefix
      stub(() => ({
        status: 200,
        json: { proofHash: "h", taskId: "t", geohash: full, capturedAt: "2026-09-07", attestationCount: 0, attestations: [] },
      }));
      const res = await fetchProof("h");
      assert.equal(res.state, "ok");
      if (res.state === "ok") {
        assert.ok(res.proof.geohashRegion.length <= REGION_PREFIX_LEN);
        assert.ok(full.startsWith(res.proof.geohashRegion));
        assert.ok(!JSON.stringify(res.proof).includes(full));
      }
    }
  } finally {
    restore();
  }
});

test("fetchProofs: non-ok and throw both degrade to empty + degraded flag", async () => {
  try {
    stub(() => ({ status: 500 }));
    assert.deepEqual(await fetchProofs(), { proofs: [], degraded: true });
    globalThis.fetch = (async () => {
      throw new Error("down");
    }) as typeof fetch;
    assert.deepEqual(await fetchProofs(), { proofs: [], degraded: true });
    stub(() => ({ status: 200, json: [{ proofHash: "p", taskId: "t", geohashRegion: "9q8yy", capturedAt: "2026-09-07", attestationCount: 1 }] }));
    const okr = await fetchProofs();
    assert.equal(okr.degraded, false);
    assert.equal(okr.proofs.length, 1);
  } finally {
    restore();
  }
});
