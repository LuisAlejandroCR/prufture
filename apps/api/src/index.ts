// index.ts: HTTP surface for the relayer/backend.
// POST /sync   - receive a signed proof, verify signature, attest on-chain (or degrade).
// POST /attest - a second attester confirms the same proofHash ("more eyes").
// POST /notify - send the public verifyUrl over a delivery channel (url only, no payload).
// POST /verify-identity - attach a verified attribute (boolean) to a proof via Neuro, or degrade.
// GET  /proof/:hash - public verification data, zero PII.
// GET  /proofs      - aggregate list for the stakeholder dashboard.

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { verifyProof, type SignedProof } from "@proof/core";
import { env } from "./env.js";
import { addAttestation, allProofs, getProof, setVerifiedAttribute, upsertProof } from "./store.js";
import { submitAttestation } from "./relayer.js";
import { getVerifiedAttribute } from "./neuro.js";
import { sendVerifyUrl, type Channel } from "./channels.js";
import { maybeNotify } from "./notify.js";

const VERIFY_BASE = process.env.VERIFY_BASE_URL ?? "http://localhost:3000";
const CHANNELS: Channel[] = ["whatsapp", "email", "telegram"];

const app = new Hono();

app.get("/health", (c) => c.json({ ok: true, chainId: env.chainId }));

app.post("/sync", async (c) => {
  // `reportId` is an OPTIONAL top-level field (NOT inside SignedProof, NOT signed) that groups
  // the 1..N photos of one field report so the programme team gets ONE notification per report.
  let body: SignedProof & { reportId?: string };
  try {
    body = (await c.req.json()) as SignedProof & { reportId?: string };
  } catch {
    return c.json({ error: "invalid json" }, 400);
  }
  if (!verifyProof(body)) return c.json({ error: "invalid signature" }, 400);

  const payload = { proofHash: body.proofHash, taskId: body.taskId, geohash: body.geohash, capturedAt: body.capturedAt };
  const reportId = typeof body.reportId === "string" && body.reportId ? body.reportId : undefined;
  upsertProof(payload, reportId);

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

  // Best-effort programme ping (one per report, deduped, url-only). Awaited so a test can observe
  // it, but wrapped so it can never throw or change this 200 response.
  const entry = getProof(payload.proofHash);
  if (entry) await maybeNotify(entry, "sync").catch(() => undefined);

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

  // Notify on a genuinely new attestation only (NOTIFY_ON must include "attest"). Deduped and
  // best-effort — a down channel or a repeat attester never affects this response.
  if (!already) await maybeNotify(entry, "attest").catch(() => undefined);

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
  let body: { proofHash?: string; attribute?: string; subjectRef?: string };
  try {
    body = (await c.req.json()) as typeof body;
  } catch {
    return c.json({ error: "invalid json" }, 400);
  }
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
