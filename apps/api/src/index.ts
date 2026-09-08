// index.ts: HTTP surface for the relayer/backend.
// POST /sync   - receive a signed proof, verify signature, attest on-chain (or degrade).
// POST /attest - a second attester confirms the same proofHash ("more eyes").
// POST /notify - send the public verifyUrl over a delivery channel (url only, no payload).
// POST /verify-identity - attach a verified attribute (boolean) to a proof via Neuro, or degrade.
// POST /precise-location - store an opaque encrypted precise-location blob against a proof.
// GET  /proof/:hash - public verification data, zero PII (never the precise-location blob).
// GET  /proofs      - aggregate list for the stakeholder dashboard.

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { verifyProof, type SignedProof } from "@proof/core";
import { env } from "./env.js";
import {
  addAttestation,
  allProofs,
  getProof,
  setPreciseLocationCipher,
  setVerifiedAttribute,
  setVerifiedPerson,
  upsertProof,
} from "./store.js";
import { submitAttestation } from "./relayer.js";
import { checkLiveness, getVerifiedAttribute } from "./neuro.js";
import { sendVerifyUrl, type Channel } from "./channels.js";

const VERIFY_BASE = process.env.VERIFY_BASE_URL ?? "http://localhost:3000";
const CHANNELS: Channel[] = ["whatsapp", "email", "telegram"];

const app = new Hono();

app.get("/health", (c) => c.json({ ok: true, chainId: env.chainId }));

app.post("/sync", async (c) => {
  let body: SignedProof;
  try {
    body = (await c.req.json()) as SignedProof;
  } catch {
    return c.json({ error: "invalid json" }, 400);
  }
  if (!verifyProof(body)) return c.json({ error: "invalid signature" }, 400);

  const payload = { proofHash: body.proofHash, taskId: body.taskId, geohash: body.geohash, capturedAt: body.capturedAt };
  upsertProof(payload);

  // On-chain attestation is best-effort. A degraded relayer must not fail the sync:
  // the proof is safely queued server-side and returns 200 with status "synced".
  const attestation = await submitAttestation(payload);
  if (attestation.available) {
    addAttestation(payload.proofHash, {
      attester: attestation.data.attester,
      txHash: attestation.data.txHash,
      attestedAt: new Date().toISOString(),
    });
  }
  return c.json({ status: attestation.available ? "attested" : "synced", attestation }, 200);
});

app.post("/attest", async (c) => {
  const { proofHash } = (await c.req.json()) as { proofHash: string };
  const entry = getProof(proofHash);
  if (!entry) return c.json({ error: "unknown proofHash" }, 404);

  const attestation = await submitAttestation(entry.payload);
  if (!attestation.available) {
    return c.json({ status: "synced", attestationCount: entry.attestations.length, attestation });
  }

  // store.addAttestation dedupes by attester, so the same attester calling twice does not
  // double-count. Guard here too, to return an explicit signal instead of a silent no-op.
  const already = entry.attestations.some((a) => a.attester === attestation.data.attester);
  addAttestation(proofHash, {
    attester: attestation.data.attester,
    txHash: attestation.data.txHash,
    attestedAt: new Date().toISOString(),
  });
  return c.json({
    status: "attested",
    duplicate: already,
    attestationCount: entry.attestations.length,
    attestation,
  });
});

app.post("/notify", async (c) => {
  const { proofHash, channel, to } = (await c.req.json()) as {
    proofHash: string;
    channel: Channel;
    to: string;
  };
  if (!getProof(proofHash)) return c.json({ error: "unknown proofHash" }, 404);
  if (!CHANNELS.includes(channel)) return c.json({ error: "unknown channel" }, 400);
  if (!to) return c.json({ error: "missing recipient" }, 400);

  const url = `${VERIFY_BASE}/verify/${proofHash}`;
  const result = await sendVerifyUrl(channel, to, url);
  return c.json({ sent: result.available, result });
});

app.post("/verify-identity", async (c) => {
  let body: {
    proofHash?: string;
    attribute?: string;
    subjectRef?: string;
    frames?: unknown;
    nonceHex?: string;
    challenges?: unknown;
  };
  try {
    body = (await c.req.json()) as typeof body;
  } catch {
    return c.json({ error: "invalid json" }, 400);
  }

  // Liveness mode: selfie frames, no proofHash yet. The verdict is attached later via
  // /liveness-result. Only a boolean is returned; frames are never stored or logged.
  if (Array.isArray(body.frames)) {
    const result = await checkLiveness({
      frames: body.frames as string[],
      nonceHex: String(body.nonceHex ?? ""),
      challenges: Array.isArray(body.challenges) ? (body.challenges as string[]).map(String) : [],
    });
    if (!result.available) {
      return c.json({ verifiedPerson: false, degraded: true }, 200);
    }
    return c.json({ verifiedPerson: result.data.verifiedPerson, degraded: false }, 200);
  }

  // Default mode: verified age attribute against an existing proof (unchanged).
  if (!body.proofHash || !getProof(body.proofHash)) {
    return c.json({ error: "unknown proofHash" }, 404);
  }

  const result = await getVerifiedAttribute({ attribute: body.attribute, subjectRef: body.subjectRef });

  // Degraded (sandbox down / unconfigured): 200 with the typed result, proof unchanged.
  if (!result.available) {
    return c.json({ status: "degraded", verifiedAttribute: null, result }, 200);
  }

  // Available: record ONLY { attribute, value } — no identity field is ever persisted.
  setVerifiedAttribute(body.proofHash, {
    attribute: result.data.attribute,
    value: result.data.value,
    checkedAt: result.checkedAt,
  });
  return c.json({
    status: "recorded",
    verifiedAttribute: { attribute: result.data.attribute, value: result.data.value },
    result,
  });
});

app.post("/liveness-result", async (c) => {
  let body: { proofHash?: string; verifiedPerson?: unknown };
  try {
    body = (await c.req.json()) as typeof body;
  } catch {
    return c.json({ error: "invalid json" }, 400);
  }
  if (!body.proofHash) return c.json({ error: "missing proofHash" }, 400);
  const ok = setVerifiedPerson(body.proofHash, body.verifiedPerson === true);
  if (!ok) return c.json({ error: "unknown proofHash" }, 404);
  return c.json({ status: "recorded", verifiedPerson: body.verifiedPerson === true }, 200);
});

// MAX_CIPHER_LEN: hex cap for the opaque precise-location blob. ephPub(32) + nonce(24) +
// a small JSON plaintext + tag is well under 512 bytes -> 1024 hex chars is generous.
const MAX_CIPHER_LEN = 4096;

app.post("/precise-location", async (c) => {
  let body: { proofHash?: unknown; cipher?: unknown };
  try {
    body = (await c.req.json()) as typeof body;
  } catch {
    return c.json({ error: "invalid json" }, 400);
  }
  const proofHash = typeof body.proofHash === "string" ? body.proofHash : "";
  const cipher = typeof body.cipher === "string" ? body.cipher : "";
  if (!proofHash || !cipher) return c.json({ error: "missing proofHash or cipher" }, 400);
  if (cipher.length > MAX_CIPHER_LEN) return c.json({ error: "cipher too large" }, 413);
  // Stored opaque: never decoded, never parsed, never returned by a public route.
  const ok = setPreciseLocationCipher(proofHash, cipher);
  if (!ok) return c.json({ error: "unknown proofHash" }, 404);
  return c.json({ status: "stored" }, 200);
});

// REGION_PREFIX_LEN: how many geohash chars leave the api. 5 ≈ ~5 km cell, never exact GPS.
// The full geohash never leaves this process — not on /proof/:hash, not on /proofs.
const REGION_PREFIX_LEN = 5;

app.get("/proof/:hash", (c) => {
  const entry = getProof(c.req.param("hash"));
  if (!entry) return c.json({ error: "not found" }, 404);
  return c.json({
    proofHash: entry.payload.proofHash,
    taskId: entry.payload.taskId,
    geohashRegion: entry.payload.geohash.slice(0, REGION_PREFIX_LEN),
    capturedAt: entry.payload.capturedAt,
    attestationCount: entry.attestations.length,
    attestations: entry.attestations,
    // Boolean-only: { attribute, value }. Never an identity field. Absent until /verify-identity.
    verifiedAttribute: entry.verifiedAttribute
      ? { attribute: entry.verifiedAttribute.attribute, value: entry.verifiedAttribute.value }
      : null,
    // Selfie liveness verdict. null until a result is attached. Boolean only, never an identity field.
    verifiedPerson: typeof entry.verifiedPerson === "boolean" ? entry.verifiedPerson : null,
  });
});

app.get("/proofs", (c) =>
  c.json(
    allProofs().map((e) => ({
      proofHash: e.payload.proofHash,
      taskId: e.payload.taskId,
      geohashRegion: e.payload.geohash.slice(0, REGION_PREFIX_LEN),
      capturedAt: e.payload.capturedAt,
      attestationCount: e.attestations.length,
    })),
  ),
);

// Skip binding a socket under `node --test` so the HTTP surface can be exercised via app.request.
if (!process.env.NODE_TEST_CONTEXT) {
  serve({ fetch: app.fetch, port: env.port }, (i) => console.log(`api on :${i.port}`));
}

export { app };
