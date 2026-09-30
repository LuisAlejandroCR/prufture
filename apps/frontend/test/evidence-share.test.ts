// evidence-share.test.ts: the only way a photo leaves the phone. Opt-in is off by default, nothing is
// queued or sent without a programme key, only the photo matching its proofHash can be sealed, a
// coordinator request needs the reporter's yes, and — the invariant — no request body the app sends
// to the api ever carries plaintext image bytes; what it does send opens to the exact photo.

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { x25519 } from "@noble/curves/ed25519";
import { hashBytes } from "@proof/core";
import { openEvidence } from "../src/evidence-seal.js";
import { __setEvidenceSecretSource, deriveEvidenceToken } from "../src/evidence-token.js";
import {
  __setEvidenceBackend,
  approveEvidenceRequest,
  checkEvidenceRequests,
  declineEvidenceRequest,
  evidenceSharingAvailable,
  flushEvidenceOutbox,
  pendingEvidenceRequests,
  queueOptInEvidence,
  sealPhotoForProof,
  shareCopy,
  syncEvidence,
} from "../src/evidence-share.js";
import {
  __setCaptureProofForTest,
  getDraft,
  saveDraft,
  setShareEvidence,
  startDraft,
  addPhoto,
  setArea,
} from "../src/report-draft.js";
import { __setDraftStoreBackend } from "../src/draft-store.js";
import { __setNotesBackend } from "../src/report-note.js";

const toHex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
const priv = x25519.utils.randomPrivateKey();
const PRIV = toHex(priv);
const PUB = toHex(x25519.getPublicKey(priv));
const API = "https://api.example.test/";

const MARKER = new TextEncoder().encode("PLAINTEXT-IMAGE-MARKER");
function photo(seed: number): Uint8Array {
  const body = new Uint8Array(3000).map((_, i) => (i * 31 + seed) % 256);
  return Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, ...MARKER, ...body]);
}

/** The device evidence secret for every test; tokens derive from it deterministically. */
const SECRET = "5e".repeat(32);
const tokenOf = (proofHash: string) => deriveEvidenceToken(SECRET, proofHash);

let disk: string | null = null;
beforeEach(() => {
  disk = null;
  __setEvidenceSecretSource(async () => SECRET);
  __setEvidenceBackend({
    read: async () => disk,
    write: async (t) => {
      disk = t;
    },
  });
});

interface Sent {
  url: string;
  body: string;
}

/** A fake api: records every request body; /evidence answers `evidenceStatus`. */
function fakeApi(opts: { evidenceStatus?: number; requested?: string[] } = {}) {
  const sent: Sent[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    sent.push({ url, body: String(init?.body ?? "") });
    if (url.endsWith("/evidence")) return new Response("{}", { status: opts.evidenceStatus ?? 200 });
    if (url.endsWith("/evidence-requests")) {
      return new Response(JSON.stringify({ requested: opts.requested ?? [] }), { status: 200 });
    }
    return new Response("{}", { status: 404 });
  }) as typeof fetch;
  return { sent, fetchImpl };
}

/** The invariant, checked against every body the app sent. */
function assertNoPlaintext(sent: Sent[], photos: Uint8Array[]): void {
  for (const s of sent) {
    assert.ok(!s.body.includes("PLAINTEXT-IMAGE-MARKER"), `${s.url}: marker in body`);
    for (const p of photos) {
      assert.ok(!s.body.includes(Buffer.from(p).toString("base64").slice(0, 24)), `${s.url}: base64 photo in body`);
    }
    if (!s.url.endsWith("/evidence")) continue;
    const blob = Buffer.from((JSON.parse(s.body) as { cipher: string }).cipher, "base64");
    assert.notDeepEqual([...blob.subarray(0, 3)], [0xff, 0xd8, 0xff], "JPEG header on the wire");
    for (const p of photos) {
      for (let i = 0; i + 32 <= p.length; i += 256) {
        assert.ok(!blob.includes(Buffer.from(p.subarray(i, i + 32))), `${s.url}: plaintext run at ${i}`);
      }
    }
  }
}

test("sharing is unavailable without a valid programme key, and the copy is plain language", () => {
  assert.equal(evidenceSharingAvailable(""), false);
  assert.equal(evidenceSharingAvailable("nothex"), false);
  assert.equal(evidenceSharingAvailable(PUB), true);
  const c = shareCopy(90);
  assert.match(c.toggleOn, /deleted after 90 days/);
  assert.match(c.toggleOn, /never shown on the public page/);
  assert.match(c.toggleOff, /stay on this phone/);
  assert.match(c.requestBody, /You can say no/);
});

test("sealPhotoForProof only seals the photo that matches its proofHash, and only with a key", () => {
  const p = photo(1);
  assert.throws(() => sealPhotoForProof(PUB, hashBytes(photo(2)), p), /does not match/);
  assert.throws(() => sealPhotoForProof("", hashBytes(p), p), /not set up/);
  const cipher = sealPhotoForProof(PUB, hashBytes(p), p);
  assert.deepEqual(openEvidence(PRIV, Buffer.from(cipher, "base64")), p);
});

test("opt-in: with no programme key nothing is queued and nothing is sent", async () => {
  const p = photo(3);
  assert.equal(await queueOptInEvidence([{ proofHash: hashBytes(p), bytes: p }], ""), 0);
  const { sent, fetchImpl } = fakeApi();
  await flushEvidenceOutbox(API, fetchImpl);
  assert.equal(sent.length, 0);
});

test("invariant + round-trip: opt-in upload carries only ciphertext that opens to the exact photo", async () => {
  const photos = [photo(4), photo(5)];
  const items = photos.map((p) => ({ proofHash: hashBytes(p), bytes: p }));
  assert.equal(await queueOptInEvidence(items, PUB), 2);
  assert.ok(!(disk ?? "").includes("PLAINTEXT-IMAGE-MARKER"), "outbox on disk holds ciphertext only");

  const { sent, fetchImpl } = fakeApi();
  const summary = await flushEvidenceOutbox(API, fetchImpl);
  assert.deepEqual(summary, { sent: 2, kept: 0, dropped: 0 });
  assert.equal(sent.length, 2);
  assertNoPlaintext(sent, photos);

  for (const s of sent) {
    assert.equal(s.url, "https://api.example.test/evidence");
    const body = JSON.parse(s.body) as { proofHash: string; token: string; cipher: string };
    assert.deepEqual(Object.keys(body).sort(), ["cipher", "proofHash", "token"], "no other field on the wire");
    assert.equal(body.token, tokenOf(body.proofHash), "the upload carries this proof's own token");
    const opened = openEvidence(PRIV, Buffer.from(body.cipher, "base64"));
    assert.equal(hashBytes(opened), body.proofHash);
  }

  // Sent once: a second pass has nothing to send, and re-queuing the same proof is a no-op.
  assert.equal((await flushEvidenceOutbox(API, fetchImpl)).sent, 0);
  assert.equal(await queueOptInEvidence(items, PUB), 0);
});

test("outbox keeps items while the proof is not on the api (404), storage is off (503) or offline", async () => {
  const p = photo(6);
  await queueOptInEvidence([{ proofHash: hashBytes(p), bytes: p }], PUB);
  for (const status of [404, 503]) {
    assert.deepEqual(await flushEvidenceOutbox(API, fakeApi({ evidenceStatus: status }).fetchImpl), { sent: 0, kept: 1, dropped: 0 });
  }
  const offline = (async () => {
    throw new Error("offline");
  }) as unknown as typeof fetch;
  assert.equal((await flushEvidenceOutbox(API, offline)).kept, 1);
  assert.equal((await flushEvidenceOutbox(API, fakeApi({ evidenceStatus: 410 }).fetchImpl)).dropped, 1);
});

test("coordinator request: nothing is sent until the reporter says yes", async () => {
  const p = photo(7);
  const hash = hashBytes(p);
  const { sent, fetchImpl } = fakeApi({ requested: [hash] });

  await syncEvidence(API, fetchImpl, [hash, hashBytes(photo(8))]);
  assert.deepEqual(await pendingEvidenceRequests(), [hash]);
  assert.equal(sent.filter((s) => s.url.endsWith("/evidence")).length, 0, "a request alone uploads nothing");
  const check = sent.find((s) => s.url.endsWith("/evidence-requests"))!;
  // Each hash travels with its own token, and nothing else is in the body.
  const asked = JSON.parse(check.body) as { proofs: { proofHash: string; token: string }[] };
  assert.deepEqual(Object.keys(asked), ["proofs"]);
  assert.deepEqual(asked.proofs.map((p) => p.token), asked.proofs.map((p) => tokenOf(p.proofHash)));

  const res = await approveEvidenceRequest([{ proofHash: hash, readPhoto: async () => p }], API, fetchImpl, PUB);
  assert.deepEqual(res, { ok: true, queued: 1, missing: 0 });
  const uploads = sent.filter((s) => s.url.endsWith("/evidence"));
  assert.equal(uploads.length, 1);
  assertNoPlaintext(sent, [p]);
  assert.deepEqual(await pendingEvidenceRequests(), []);

  // Already shared: a later check does not re-ask about it.
  const again = fakeApi({ requested: [hash] });
  await checkEvidenceRequests(API, [hash], again.fetchImpl);
  assert.equal(again.sent.length, 0);
});

test("coordinator request: a declined request is remembered locally and never sent anywhere", async () => {
  const hash = hashBytes(photo(9));
  const { sent, fetchImpl } = fakeApi({ requested: [hash] });
  await checkEvidenceRequests(API, [hash], fetchImpl);
  await declineEvidenceRequest([hash]);
  assert.deepEqual(await pendingEvidenceRequests(), []);
  const before = sent.length;
  await syncEvidence(API, fetchImpl, [hash]);
  assert.equal(sent.length, before, "a declined proof is not even re-checked");
});

test("approval with a photo gone from the phone, or a mismatching file, uploads nothing for it", async () => {
  const p = photo(10);
  const { sent, fetchImpl } = fakeApi();
  const res = await approveEvidenceRequest(
    [
      { proofHash: hashBytes(p), readPhoto: async () => null },
      { proofHash: hashBytes(photo(11)), readPhoto: async () => p },
    ],
    API,
    fetchImpl,
    PUB,
  );
  assert.deepEqual(res, { ok: true, queued: 0, missing: 2 });
  assert.equal(sent.length, 0);
  assert.deepEqual(await approveEvidenceRequest([], API, fetchImpl, ""), { ok: false, reason: "unavailable" });
});

// saveDraft wiring: the review-step toggle decides, and it defaults to off.

function wireDraftDeps() {
  __setDraftStoreBackend({
    ensureDir: async () => undefined,
    readDraft: async () => null,
    writeDraft: async () => undefined,
    removeDir: async () => undefined,
    copyIn: async (src) => src,
    readBytes: async () => new Uint8Array(),
  });
  __setNotesBackend({ read: async () => null, write: async () => undefined });
  __setCaptureProofForTest((async (input: { mediaBytes: Uint8Array; taskId: string; mediaUri: string; reportId?: string }) => ({
    id: hashBytes(input.mediaBytes),
    proofHash: hashBytes(input.mediaBytes),
  })) as never);
}

test("saveDraft: toggle off (the default) queues nothing", async () => {
  wireDraftDeps();
  process.env.EXPO_PUBLIC_PROGRAMME_PUBKEY = PUB;
  try {
    startDraft("solar-panel-install");
    assert.equal(getDraft()?.shareEvidence, undefined, "a new draft starts with sharing off");
    addPhoto({ uri: "file:///a.jpg", bytes: photo(12), stepIndex: 0 });
    setArea("abcde", "Area");
    const r = await saveDraft();
    assert.equal(r.saved, 1);
    assert.equal(disk, null, "nothing written to the evidence outbox");
  } finally {
    delete process.env.EXPO_PUBLIC_PROGRAMME_PUBKEY;
  }
});

test("saveDraft: toggle on seals each saved photo into the outbox as ciphertext", async () => {
  wireDraftDeps();
  process.env.EXPO_PUBLIC_PROGRAMME_PUBKEY = PUB;
  try {
    startDraft("solar-panel-install");
    const photos = [photo(13), photo(14)];
    photos.forEach((bytes, i) => addPhoto({ uri: `file:///p${i}.jpg`, bytes, stepIndex: i }));
    setArea("abcde", "Area");
    setShareEvidence(true);
    const r = await saveDraft();
    assert.equal(r.saved, 2);
    const { sent, fetchImpl } = fakeApi();
    assert.equal((await flushEvidenceOutbox(API, fetchImpl)).sent, 2);
    assertNoPlaintext(sent, photos);
    const opened = sent.map((s) => openEvidence(PRIV, Buffer.from((JSON.parse(s.body) as { cipher: string }).cipher, "base64")));
    assert.deepEqual(opened.map(hashBytes).sort(), photos.map(hashBytes).sort());
  } finally {
    delete process.env.EXPO_PUBLIC_PROGRAMME_PUBKEY;
    __setCaptureProofForTest(null);
    __setDraftStoreBackend(null);
    __setNotesBackend(null);
  }
});

test("no evidence token (secret store unavailable): the photo stays queued and nothing is sent", async () => {
  const p = photo(11);
  await queueOptInEvidence([{ proofHash: hashBytes(p), bytes: p }], PUB);
  __setEvidenceSecretSource(async () => null);
  const { sent, fetchImpl } = fakeApi();
  assert.deepEqual(await flushEvidenceOutbox(API, fetchImpl), { sent: 0, kept: 1, dropped: 0 });
  assert.equal(sent.length, 0);
  assert.deepEqual(await checkEvidenceRequests(API, [hashBytes(p)], fetchImpl), []);
  assert.equal(sent.length, 0, "no request check without a token either");
});

test("403 (proof synced by an older app without a token) drops the queued photo", async () => {
  const p = photo(12);
  await queueOptInEvidence([{ proofHash: hashBytes(p), bytes: p }], PUB);
  assert.deepEqual(await flushEvidenceOutbox(API, fakeApi({ evidenceStatus: 403 }).fetchImpl), { sent: 0, kept: 0, dropped: 1 });
});
