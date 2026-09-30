// evidence.test.ts: sealed evidence photos end to end on the api — "none" storage is typed
// unavailable, the size cap and the plaintext-image tripwire hold, the S3 adapter receives exactly
// the ciphertext, coordinators request and fetch it, the retention purge deletes it, and no public
// route, response or storage call ever carries a plaintext image or a credential.

import { test, afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { generateKeyPair, signPayload } from "@proof/core";
import { app } from "../src/index.js";
import { APP_USER_HEADER } from "../src/coordinator.js";
import { SEALED_OVERHEAD, purgeExpiredEvidence } from "../src/evidence.js";
import { evidenceStorage, noneStorage, type EvidenceStorage } from "../src/evidence-storage.js";
import { getEvidenceRecord, putEvidenceRecord } from "../src/store.js";

const kp = generateKeyPair();
const realFetch = globalThis.fetch;
const S3_ENDPOINT = "https://acct.r2.example.test";
const S3_SECRET = "s3-secret-DO-NOT-LEAK";
const RC_SECRET = "sk_test_rc_secret";
const asCoordinator = { [APP_USER_HEADER]: "anon-coordinator-evidence" };

const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, ...Buffer.from("JFIF"), ...randomBytes(200)]);
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...randomBytes(200)]);
const HEIC = Uint8Array.from([0, 0, 0, 0x18, ...Buffer.from("ftypheic"), ...randomBytes(200)]);

/** An opaque sealed-looking blob: random bytes, never an image magic (re-roll on the 2^-24 case). */
function sealedBlob(len = 400): Uint8Array {
  for (;;) {
    const b = new Uint8Array(randomBytes(len));
    if (!(b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) && Buffer.from(b.slice(4, 8)).toString() !== "ftyp") return b;
  }
}
const b64 = (b: Uint8Array) => Buffer.from(b).toString("base64");

let counter = 0;
/** proofHash -> the evidence token only the syncing device holds. */
const tokens = new Map<string, string>();
const tok = (hash: string) => tokens.get(hash) ?? "0".repeat(64);
const sha256hex = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

async function syncedProof(opts: { withToken?: boolean } = {}): Promise<string> {
  counter += 1;
  const hash = (counter.toString(16).padStart(8, "0") + "ab").padEnd(64, "e");
  const token = randomBytes(32).toString("hex");
  const signed = signPayload(
    { proofHash: hash, taskId: "solar-panel-installation", geohash: "9q8yy", capturedAt: "2026-09-06T14:32:00.000Z" },
    kp.privateKey,
  );
  const withToken = opts.withToken ?? true;
  const res = await post("/sync", withToken ? { ...signed, evidenceTokenHash: sha256hex(token) } : signed);
  assert.equal(res.status, 200);
  if (withToken) tokens.set(hash, token);
  return hash;
}

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
const get = (path: string, headers: Record<string, string> = {}) => app.request(path, { headers });

interface Call {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: Uint8Array | null;
}

/** In-memory S3 + RevenueCat. Records every outbound call so tests can assert where bytes went. */
function stubWorld(opts: { s3Status?: number } = {}) {
  const objects = new Map<string, Uint8Array>();
  const calls: Call[] = [];
  process.env.EVIDENCE_STORAGE = "s3";
  process.env.EVIDENCE_S3_ENDPOINT = S3_ENDPOINT;
  process.env.EVIDENCE_S3_BUCKET = "prufture-evidence";
  process.env.EVIDENCE_S3_ACCESS_KEY_ID = "AKIDEXAMPLE";
  process.env.EVIDENCE_S3_SECRET_ACCESS_KEY = S3_SECRET;
  process.env.REVENUECAT_SECRET_KEY = RC_SECRET;
  process.env.REVENUECAT_PROJECT_ID = "proj1";
  process.env.REVENUECAT_COORDINATOR_ENTITLEMENT_ID = "entl0c00rd1n4";
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const headers = Object.fromEntries(new Headers(init?.headers).entries());
    const body = init?.body ? new Uint8Array(init.body as Uint8Array) : null;
    calls.push({ method, url, headers, body });
    if (url.includes("revenuecat")) {
      return new Response(JSON.stringify({ items: [{ entitlement_id: "entl0c00rd1n4" }] }), { status: 200 });
    }
    if (opts.s3Status) return new Response("<Error><Message>echo " + S3_SECRET + "</Message></Error>", { status: opts.s3Status });
    const key = new URL(url).pathname;
    if (method === "PUT") {
      objects.set(key, body ?? new Uint8Array());
      return new Response(null, { status: 200 });
    }
    if (method === "GET") {
      const o = objects.get(key);
      return o ? new Response(o, { status: 200 }) : new Response("", { status: 404 });
    }
    if (method === "DELETE") {
      objects.delete(key);
      return new Response(null, { status: 204 });
    }
    return new Response("", { status: 400 });
  }) as typeof fetch;
  return { objects, calls };
}

beforeEach(() => {
  delete process.env.EVIDENCE_STORAGE;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  for (const k of Object.keys(process.env)) {
    if (k.startsWith("EVIDENCE_") || k.startsWith("REVENUECAT_")) delete process.env[k];
  }
});

test("default storage is 'none': upload and coordinator request are typed unavailable, nothing stored", async () => {
  assert.equal(evidenceStorage().kind, "none");
  const hash = await syncedProof();
  const res = await post("/evidence", { proofHash: hash, token: tok(hash), cipher: b64(sealedBlob()) });
  assert.equal(res.status, 503);
  const j = (await res.json()) as { stored: boolean; result: { available: boolean; source: string } };
  assert.equal(j.stored, false);
  assert.equal(j.result.available, false);
  assert.equal(j.result.source, "evidence-storage");
  assert.deepEqual(Object.keys(getEvidenceRecord(hash) ?? {}), ["tokenHash"], "only the token hash");
});

test("EVIDENCE_STORAGE=s3 with a missing setting degrades typed, naming the missing key only", async () => {
  process.env.EVIDENCE_STORAGE = "s3";
  process.env.EVIDENCE_S3_SECRET_ACCESS_KEY = S3_SECRET;
  const r = await evidenceStorage().put("k", new Uint8Array(1));
  assert.equal(r.available, false);
  assert.match(r.error ?? "", /missing endpoint, bucket, accessKeyId/);
  assert.ok(!(r.error ?? "").includes(S3_SECRET));
});

test("input validation: bad proofHash 400, unknown proof 404, non-base64 400, too short 400", async () => {
  stubWorld();
  assert.equal((await post("/evidence", { proofHash: "nope", token: tok("nope"), cipher: b64(sealedBlob()) })).status, 400);
  assert.equal((await post("/evidence", { proofHash: "d".repeat(64), token: tok("d".repeat(64)), cipher: b64(sealedBlob()) })).status, 404);
  const hash = await syncedProof();
  assert.equal((await post("/evidence", { proofHash: hash, token: tok(hash), cipher: "!!not base64!!" })).status, 400);
  assert.equal((await post("/evidence", { proofHash: hash, token: tok(hash), cipher: b64(sealedBlob(SEALED_OVERHEAD)) })).status, 400);
  assert.equal((await post("/evidence", { proofHash: hash, token: tok(hash) })).status, 400);
});

test("size cap: a sealed blob over EVIDENCE_MAX_BYTES is 413 and never reaches storage", async () => {
  const { calls } = stubWorld();
  process.env.EVIDENCE_MAX_BYTES = "1000";
  const hash = await syncedProof();
  const over = await post("/evidence", { proofHash: hash, token: tok(hash), cipher: b64(sealedBlob(1001)) });
  assert.equal(over.status, 413);
  // Far over the cap is stopped by the body limit before the JSON is even parsed.
  const huge = await post("/evidence", { proofHash: hash, token: tok(hash), cipher: "A".repeat(10_000) });
  assert.equal(huge.status, 413);
  assert.equal(calls.filter((c) => c.method === "PUT").length, 0);
  const atCap = await post("/evidence", { proofHash: hash, token: tok(hash), cipher: b64(sealedBlob(1000)) });
  assert.equal(atCap.status, 200);
});

test("invariant: plaintext image bytes are refused and never reach storage", async () => {
  const { calls } = stubWorld();
  const hash = await syncedProof();
  for (const img of [JPEG, PNG, HEIC]) {
    const res = await post("/evidence", { proofHash: hash, token: tok(hash), cipher: b64(img) });
    assert.equal(res.status, 400);
    assert.match(((await res.json()) as { error: string }).error, /plaintext image refused/);
  }
  assert.equal(calls.filter((c) => c.method === "PUT").length, 0);
});

test("s3: stores exactly the ciphertext, SigV4-signed, and talks to nothing but the bucket", async () => {
  const hash = await syncedProof();
  const { objects, calls } = stubWorld();
  // Notifications armed: an evidence upload must still never trigger one.
  process.env.NOTIFY_ENABLED = "true";
  process.env.PROGRAMME_EMAIL = "programme@example.test";
  try {
    const blob = sealedBlob();
    const res = await post("/evidence", { proofHash: hash, token: tok(hash), cipher: b64(blob) });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { status: "stored", duplicate: false });

    assert.equal(calls.length, 1, "one storage call, no notification, no other host");
    const put = calls[0]!;
    assert.equal(put.method, "PUT");
    assert.equal(put.url, `${S3_ENDPOINT}/prufture-evidence/evidence/${hash}`);
    assert.match(put.headers.authorization ?? "", /^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\/\d{8}\/auto\/s3\/aws4_request, SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/);
    assert.ok(!JSON.stringify(put.headers).includes(S3_SECRET), "secret never sent");
    assert.deepEqual(objects.get(`/prufture-evidence/evidence/${hash}`), blob);

    const rec = getEvidenceRecord(hash)!;
    assert.equal(rec.bytes, blob.length);
    assert.match(rec.cipherSha256 ?? "", /^[0-9a-f]{64}$/);

    // Idempotent retry; a different blob cannot replace it.
    assert.deepEqual(await (await post("/evidence", { proofHash: hash, token: tok(hash), cipher: b64(blob) })).json(), {
      status: "stored",
      duplicate: true,
    });
    assert.equal((await post("/evidence", { proofHash: hash, token: tok(hash), cipher: b64(sealedBlob()) })).status, 409);
  } finally {
    delete process.env.NOTIFY_ENABLED;
    delete process.env.PROGRAMME_EMAIL;
  }
});

test("storage failure is 503 typed, and the S3 error body / secret never reach the response", async () => {
  stubWorld({ s3Status: 500 });
  const hash = await syncedProof();
  const res = await post("/evidence", { proofHash: hash, token: tok(hash), cipher: b64(sealedBlob()) });
  assert.equal(res.status, 503);
  const text = await res.text();
  assert.ok(!text.includes(S3_SECRET));
  assert.match(text, /storage PUT 500/);
  assert.deepEqual(Object.keys(getEvidenceRecord(hash) ?? {}), ["tokenHash"], "nothing recorded when the write failed");
});

test("coordinator flow: request -> app sees it -> upload -> coordinator downloads the same bytes", async () => {
  stubWorld();
  const hash = await syncedProof();
  const other = await syncedProof();

  // Gated like every coordinator route.
  assert.equal((await post("/coordinator/evidence-request", { proofHash: hash })).status, 401);

  const req = await post("/coordinator/evidence-request", { proofHash: hash }, asCoordinator);
  assert.equal(req.status, 200);
  assert.deepEqual(await req.json(), { state: "requested" });

  const before = await get(`/coordinator/evidence/${hash}`, asCoordinator);
  assert.equal(before.status, 404);
  assert.equal(((await before.json()) as { state: string }).state, "requested");

  const check = await post("/evidence-requests", { proofs: [hash, other, "junk"].map((h) => ({ proofHash: h, token: tok(h) })) });
  assert.deepEqual(await check.json(), { requested: [hash] });

  const blob = sealedBlob();
  assert.equal((await post("/evidence", { proofHash: hash, token: tok(hash), cipher: b64(blob) })).status, 200);
  assert.deepEqual(await (await post("/evidence-requests", { proofs: [{ proofHash: hash, token: tok(hash) }] })).json(), { requested: [] });

  const dl = await get(`/coordinator/evidence/${hash}`, asCoordinator);
  assert.equal(dl.status, 200);
  assert.equal(dl.headers.get("content-type"), "application/octet-stream");
  assert.equal(dl.headers.get("cache-control"), "no-store");
  assert.deepEqual(new Uint8Array(await dl.arrayBuffer()), blob);

  // Asking again once it is stored does not re-prompt the reporter.
  const again = await post("/coordinator/evidence-request", { proofHash: hash }, asCoordinator);
  assert.deepEqual(await again.json(), { state: "available" });
});

test("coordinator request refuses when storage is 'none' (would prompt the reporter for nothing)", async () => {
  stubWorld();
  delete process.env.EVIDENCE_STORAGE;
  const hash = await syncedProof();
  const res = await post("/coordinator/evidence-request", { proofHash: hash }, asCoordinator);
  assert.equal(res.status, 503);
  assert.deepEqual(Object.keys(getEvidenceRecord(hash) ?? {}), ["tokenHash"], "only the token hash");
});

test("/evidence-requests caps the list", async () => {
  const res = await post("/evidence-requests", { proofs: Array.from({ length: 201 }, () => ({ proofHash: "a".repeat(64), token: "b".repeat(64) })) });
  assert.equal(res.status, 413);
  assert.equal((await post("/evidence-requests", { proofs: "x" })).status, 400);
});

test("no public route exposes the blob, its digest or its existence", async () => {
  stubWorld();
  const hash = await syncedProof();
  const blob = sealedBlob();
  await post("/evidence", { proofHash: hash, token: tok(hash), cipher: b64(blob) });
  const digest = getEvidenceRecord(hash)!.cipherSha256!;

  const bodies = [
    await (await get(`/proof/${hash}`)).text(),
    await (await get("/proofs")).text(),
    await (await get("/coordinator/reports", asCoordinator)).text(),
    await (await get("/coordinator/export.csv", asCoordinator)).text(),
  ];
  for (const body of bodies) {
    assert.ok(!body.includes(b64(blob).slice(0, 40)), "ciphertext leaked");
    assert.ok(!body.includes(digest), "digest leaked");
    assert.ok(!/evidence/i.test(body), "evidence field leaked");
  }
});

test("retention purge: deletes blobs older than EVIDENCE_RETENTION_DAYS, keeps fresh ones, drops stale requests", async () => {
  const { objects, calls } = stubWorld();
  process.env.EVIDENCE_RETENTION_DAYS = "90";
  const old = await syncedProof();
  const fresh = await syncedProof();
  const staleReq = await syncedProof();
  for (const h of [old, fresh]) {
    assert.equal((await post("/evidence", { proofHash: h, token: tok(h), cipher: b64(sealedBlob()) })).status, 200);
  }
  const now = Date.now();
  const days = (n: number) => new Date(now - n * 86_400_000).toISOString();
  putEvidenceRecord(old, { ...getEvidenceRecord(old)!, storedAt: days(91) });
  putEvidenceRecord(fresh, { ...getEvidenceRecord(fresh)!, storedAt: days(89) });
  putEvidenceRecord(staleReq, { ...getEvidenceRecord(staleReq)!, requestedAt: days(120) });

  const summary = await purgeExpiredEvidence(evidenceStorage(), now);
  assert.deepEqual(summary, { purged: 1, failed: 0, expiredRequests: 1 });

  assert.ok(calls.some((c) => c.method === "DELETE" && c.url.endsWith(`/evidence/${old}`)));
  assert.equal(objects.has(`/prufture-evidence/evidence/${old}`), false);
  assert.equal(objects.has(`/prufture-evidence/evidence/${fresh}`), true);
  assert.deepEqual(Object.keys(getEvidenceRecord(old)!).sort(), ["purgedAt", "tokenHash"], "only the purge time and token hash are kept");
  assert.deepEqual(Object.keys(getEvidenceRecord(staleReq)!), ["tokenHash"], "the stale request is dropped, the token kept");

  const dl = await get(`/coordinator/evidence/${old}`, asCoordinator);
  assert.equal(dl.status, 404);
  assert.equal(((await dl.json()) as { state: string }).state, "expired");
  assert.equal((await post("/evidence", { proofHash: old, token: tok(old), cipher: b64(sealedBlob()) })).status, 410);

  // A second run is a no-op.
  assert.deepEqual(await purgeExpiredEvidence(evidenceStorage(), now), { purged: 0, failed: 0, expiredRequests: 0 });
});

test("retention purge: a failed delete keeps the record for the next run", async () => {
  const hash = await syncedProof();
  putEvidenceRecord(hash, { storedAt: new Date(0).toISOString(), bytes: 10 });
  const summary = await purgeExpiredEvidence(noneStorage, Date.now(), 90);
  assert.equal(summary.failed, 1);
  assert.ok(getEvidenceRecord(hash)?.storedAt, "record kept so the next run retries");

  const throwing: EvidenceStorage = { ...noneStorage, delete: () => Promise.reject(new Error("boom")) };
  assert.equal((await purgeExpiredEvidence(throwing, Date.now(), 90)).failed, 1, "never throws");
});

test("EVIDENCE_RETENTION_DAYS defaults to 90 and ignores junk", async () => {
  const { env } = await import("../src/env.js");
  assert.equal(env.evidenceRetentionDays, 90);
  process.env.EVIDENCE_RETENTION_DAYS = "-3";
  assert.equal(env.evidenceRetentionDays, 90);
  process.env.EVIDENCE_RETENTION_DAYS = "30";
  assert.equal(env.evidenceRetentionDays, 30);
});

test("evidence token: a stranger who knows the public proofHash cannot upload for it or see its requests", async () => {
  const { objects } = stubWorld();
  const hash = await syncedProof();
  const stranger = randomBytes(32).toString("hex");

  // No token, a wrong token, or junk: 403, and nothing reaches storage.
  for (const token of [undefined, stranger, "nope", tok(hash).toUpperCase()]) {
    const res = await post("/evidence", { proofHash: hash, token, cipher: b64(sealedBlob()) });
    assert.equal(res.status, 403, String(token));
  }
  assert.equal(objects.size, 0);

  // Replaying the public proof with the attacker's own token hash cannot claim it after the fact.
  const signed = signPayload(
    { proofHash: hash, taskId: "solar-panel-installation", geohash: "9q8yy", capturedAt: "2026-09-06T14:32:00.000Z" },
    kp.privateKey,
  );
  assert.equal((await post("/sync", { ...signed, evidenceTokenHash: sha256hex(stranger) })).status, 200);
  assert.equal((await post("/evidence", { proofHash: hash, token: stranger, cipher: b64(sealedBlob()) })).status, 403);

  // A coordinator request is invisible without the token, visible with it.
  assert.equal((await post("/coordinator/evidence-request", { proofHash: hash }, asCoordinator)).status, 200);
  const probe = await post("/evidence-requests", { proofs: [{ proofHash: hash, token: stranger }, { proofHash: hash }] });
  assert.deepEqual(await probe.json(), { requested: [] });
  const mine = await post("/evidence-requests", { proofs: [{ proofHash: hash, token: tok(hash) }] });
  assert.deepEqual(await mine.json(), { requested: [hash] });

  // The real device still uploads, and the request carried the token through.
  assert.equal((await post("/evidence", { proofHash: hash, token: tok(hash), cipher: b64(sealedBlob()) })).status, 200);
  assert.equal(getEvidenceRecord(hash)?.tokenHash, sha256hex(tok(hash)));
});

test("evidence token: a proof first synced without one can never take evidence", async () => {
  stubWorld();
  const hash = await syncedProof({ withToken: false });
  const late = randomBytes(32).toString("hex");
  const signed = signPayload(
    { proofHash: hash, taskId: "solar-panel-installation", geohash: "9q8yy", capturedAt: "2026-09-06T14:32:00.000Z" },
    kp.privateKey,
  );
  assert.equal((await post("/sync", { ...signed, evidenceTokenHash: sha256hex(late) })).status, 200);
  assert.equal(getEvidenceRecord(hash), undefined, "a later sync cannot register a token");
  assert.equal((await post("/evidence", { proofHash: hash, token: late, cipher: b64(sealedBlob()) })).status, 403);
});
