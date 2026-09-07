// index.ts: HTTP surface for the relayer/backend.
// POST /sync   - receive a signed proof, verify signature, attest on-chain (or degrade).
// POST /attest - a second attester confirms the same proofHash ("more eyes").
// GET  /proof/:hash - public verification data, zero PII.
// GET  /proofs      - aggregate list for the stakeholder dashboard.

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { verifyProof, type SignedProof } from "@proof/core";
import { env } from "./env.js";
import { addAttestation, allProofs, getProof, upsertProof } from "./store.js";
import { submitAttestation } from "./relayer.js";

const app = new Hono();

app.get("/health", (c) => c.json({ ok: true, chainId: env.chainId }));

app.post("/sync", async (c) => {
  const body = (await c.req.json()) as SignedProof;
  if (!verifyProof(body)) return c.json({ error: "invalid signature" }, 400);

  const payload = { proofHash: body.proofHash, taskId: body.taskId, geohash: body.geohash, capturedAt: body.capturedAt };
  upsertProof(payload);

  const attestation = await submitAttestation(payload);
  if (attestation.available) {
    addAttestation(payload.proofHash, {
      attester: attestation.data.attester,
      txHash: attestation.data.txHash,
      attestedAt: new Date().toISOString(),
    });
  }
  return c.json({ status: attestation.available ? "attested" : "synced", attestation });
});

app.post("/attest", async (c) => {
  const { proofHash } = (await c.req.json()) as { proofHash: string };
  const entry = getProof(proofHash);
  if (!entry) return c.json({ error: "unknown proofHash" }, 404);

  const attestation = await submitAttestation(entry.payload);
  if (!attestation.available) return c.json({ status: "synced", attestation });

  addAttestation(proofHash, {
    attester: attestation.data.attester,
    txHash: attestation.data.txHash,
    attestedAt: new Date().toISOString(),
  });
  return c.json({ status: "attested", attestation });
});

app.get("/proof/:hash", (c) => {
  const entry = getProof(c.req.param("hash"));
  if (!entry) return c.json({ error: "not found" }, 404);
  return c.json({ ...entry.payload, attestationCount: entry.attestations.length, attestations: entry.attestations });
});

app.get("/proofs", (c) =>
  c.json(
    allProofs().map((e) => ({
      proofHash: e.payload.proofHash,
      taskId: e.payload.taskId,
      geohashRegion: e.payload.geohash.slice(0, 4),
      capturedAt: e.payload.capturedAt,
      attestationCount: e.attestations.length,
    })),
  ),
);

serve({ fetch: app.fetch, port: env.port }, (i) => console.log(`api on :${i.port}`));

export { app };
