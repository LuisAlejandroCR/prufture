// idempotency.test.ts: the portability guardrails "idempotency by proofHash" and "every provider
// call uses an explicit timeout". /sync and /attest are unauthenticated and proof hashes are
// public, so a submission must be skipped BEFORE the submitter runs when this relayer already
// anchored the proof — otherwise every re-send or repeated /attest call pays for a new tx.
//
// Nothing here touches the chain.

import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { signPayload, generateKeyPair, type ProofPublicPayload } from "@proof/core";
import { privateKeyToAccount } from "viem/accounts";
import { app } from "../src/index.js";
import { addAttestation, getProof, upsertProof } from "../src/store.js";
import { attestOnce } from "../src/relayer.js";
import { sendVerifyUrl, CHANNEL_TIMEOUT_MS, type Channel } from "../src/channels.js";
import { localKeySubmitter } from "../src/submitters/local-key.js";
import type { AttestationSubmitter } from "../src/submitter.js";

const A = "0x00000000000000000000000000000000000000aa";
const B = "0x00000000000000000000000000000000000000bb";

function hash(): string {
  return randomBytes(32).toString("hex");
}

function payload(proofHash = hash()): ProofPublicPayload {
  return { proofHash, taskId: "solar-panel-installation", geohash: "9q8yy", capturedAt: "2026-09-06T14:32:00.000Z" };
}

function spy(opts: { attester?: () => string | null; delayMs?: number } = {}): AttestationSubmitter & { calls: number } {
  const s = {
    name: "spy",
    calls: 0,
    isConfigured: () => true,
    async submit() {
      s.calls++;
      if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
      return { available: true as const, source: "relayer/eas", checkedAt: "now", data: { txHash: "0xnew", attester: A }, error: null };
    },
  } as AttestationSubmitter & { calls: number };
  if (opts.attester) s.attester = opts.attester;
  return s;
}

// --- attestOnce ------------------------------------------------------------------------------

test("a proof this submitter already attested is not submitted again; the stored record is returned", async () => {
  const s = spy({ attester: () => A });
  const r = await attestOnce(payload(), [{ attester: A, txHash: "0xold" }], s);
  assert.equal(s.calls, 0);
  assert.equal(r.available, true);
  assert.deepEqual(r.data, { txHash: "0xold", attester: A });
});

test("the attester match is address-normalised, not a string compare", async () => {
  const s = spy({ attester: () => A.toUpperCase().replace("0X", "0x") });
  await attestOnce(payload(), [{ attester: A, txHash: "0xold" }], s);
  assert.equal(s.calls, 0);
});

test("a record from a different attester does not stop this submitter from adding its own", async () => {
  const s = spy({ attester: () => A });
  const r = await attestOnce(payload(), [{ attester: B, txHash: "0xother" }], s);
  assert.equal(s.calls, 1);
  assert.equal(r.data?.txHash, "0xnew");
});

test("an adapter that cannot name its attester never re-submits an attested proof", async () => {
  const s = spy();
  await attestOnce(payload(), [{ attester: B, txHash: "0xother" }], s);
  assert.equal(s.calls, 0);
});

test("an attester() that throws is treated as unknown, which fails closed on gas", async () => {
  const s = spy({
    attester: () => {
      throw new Error("boom");
    },
  });
  const r = await attestOnce(payload(), [{ attester: B, txHash: "0xother" }], s);
  assert.equal(s.calls, 0);
  assert.equal(r.available, true);
});

test("an unattested proof is submitted exactly once", async () => {
  const s = spy({ attester: () => A });
  const r = await attestOnce(payload(), [], s);
  assert.equal(s.calls, 1);
  assert.equal(r.available, true);
});

test("concurrent calls for the same proof converge on one submission", async () => {
  const s = spy({ attester: () => A, delayMs: 20 });
  const p = payload();
  const results = await Promise.all([attestOnce(p, [], s), attestOnce(p, [], s), attestOnce(p, [], s)]);
  assert.equal(s.calls, 1);
  for (const r of results) assert.equal(r.data?.txHash, "0xnew");

  // Once settled, the in-flight slot is released: a later call is judged on the store again.
  await attestOnce(p, [], s);
  assert.equal(s.calls, 2);
});

test("concurrent calls for different proofs do not block each other", async () => {
  const s = spy({ attester: () => A, delayMs: 10 });
  await Promise.all([attestOnce(payload(), [], s), attestOnce(payload(), [], s)]);
  assert.equal(s.calls, 2);
});

// --- local-key names its attester without sending ---------------------------------------------

test("local-key: no attester while unconfigured, the key's address once configured", () => {
  const saved = { RPC_URL: process.env.RPC_URL, RELAYER_PRIVATE_KEY: process.env.RELAYER_PRIVATE_KEY, EAS_SCHEMA_UID: process.env.EAS_SCHEMA_UID };
  try {
    delete process.env.RPC_URL;
    delete process.env.RELAYER_PRIVATE_KEY;
    assert.equal(localKeySubmitter.attester?.(), null);

    const pk = `0x${"11".repeat(32)}` as const;
    process.env.RPC_URL = "http://127.0.0.1:1";
    process.env.RELAYER_PRIVATE_KEY = pk.slice(2); // accepted without the 0x prefix too
    process.env.EAS_SCHEMA_UID = `0x${"24".repeat(32)}`;
    assert.equal(localKeySubmitter.attester?.(), privateKeyToAccount(pk).address);
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});

// --- the routes use it -------------------------------------------------------------------------

const kp = generateKeyPair();
const call = (path: string, body: unknown) =>
  app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

test("/sync of an already-anchored proof reports attested from the store, with no submission", async () => {
  // The relayer is unconfigured in this suite, so a submission could only ever degrade to
  // "synced". Getting "attested" back proves the stored record answered instead.
  const p = payload();
  upsertProof(p);
  addAttestation(p.proofHash, { attester: A, txHash: "0xstored", attestedAt: "2026-09-06T15:00:00.000Z" });

  const res = await call("/sync", signPayload(p, kp.privateKey));
  assert.equal(res.status, 200);
  const j = (await res.json()) as { status: string; attestation: { data: { txHash: string } } };
  assert.equal(j.status, "attested");
  assert.equal(j.attestation.data.txHash, "0xstored");
  assert.equal(getProof(p.proofHash)?.attestations.length, 1);
});

test("/attest on an already-anchored proof is a duplicate that sends nothing", async () => {
  const p = payload();
  upsertProof(p);
  addAttestation(p.proofHash, { attester: A, txHash: "0xstored", attestedAt: "2026-09-06T15:00:00.000Z" });

  const res = await call("/attest", { proofHash: p.proofHash });
  const j = (await res.json()) as { status: string; duplicate: boolean; attestationCount: number };
  assert.equal(j.status, "attested");
  assert.equal(j.duplicate, true);
  assert.equal(j.attestationCount, 1);
});

// --- channels: explicit timeout ----------------------------------------------------------------

test("a hung delivery provider degrades within the channel budget on every channel, never throws", async () => {
  const saved = { ...process.env };
  const realFetch = globalThis.fetch;
  process.env.KAPSO_API_KEY = "k";
  process.env.KAPSO_PHONE_NUMBER_ID = "111";
  process.env.EMAIL_API_KEY = "e";
  process.env.EMAIL_FROM = "bot@prufture.test";
  process.env.TELEGRAM_BOT_TOKEN = "t";
  // Never resolves on its own. Rejects only when the client aborts.
  globalThis.fetch = ((_url: string, init?: RequestInit) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        const err = new Error("aborted");
        err.name = "AbortError";
        reject(err);
      });
    })) as typeof fetch;

  try {
    const started = Date.now();
    const channels: Channel[] = ["whatsapp", "email", "telegram"];
    const results = await Promise.all(channels.map((ch) => sendVerifyUrl(ch, "+10000000000", "https://x/verify/1")));
    const elapsed = Date.now() - started;

    for (const r of results) {
      assert.equal(r.available, false);
      assert.equal(r.data, null);
    }
    assert.ok(elapsed < CHANNEL_TIMEOUT_MS + 3000, `expected degrade within the budget, took ${elapsed}ms`);
  } finally {
    globalThis.fetch = realFetch;
    for (const k of ["KAPSO_API_KEY", "KAPSO_PHONE_NUMBER_ID", "EMAIL_API_KEY", "EMAIL_FROM", "TELEGRAM_BOT_TOKEN"]) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
});
