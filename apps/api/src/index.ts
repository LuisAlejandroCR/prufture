// index.ts: HTTP surface for the relayer/backend.
// POST /sync   - receive a signed proof, verify signature, attest on-chain (or degrade).
// POST /attest - a second attester confirms the same proofHash ("more eyes").
// POST /notify - send the public verifyUrl over a delivery channel (url only, no payload).
// POST /verify-identity - attach a verified attribute (boolean) to a proof via the selected
//   AttributePort, or degrade. Both assurance ports default OFF (see assurance.ts).
// POST /precise-location - store an opaque encrypted precise-location blob against a proof.
// POST /register-push - store an anonymous Expo push token (random device id, no identity).
// GET  /proof/:hash - public verification data, zero PII (never the precise-location blob).
// GET  /proofs      - aggregate list for the stakeholder dashboard.
//
// Coordinator surface (PAID, gated by requireCoordinator -> server-side RevenueCat check):
// GET  /coordinator/reports    - review state per proof, still zero-PII.
// POST /coordinator/review     - record a triage verdict (pending/accepted/rejected + note).
// GET  /coordinator/export.csv - the same rows as CSV.

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import {
  COARSE_GEOHASH_LEN,
  MAX_REPORT_ID_LEN,
  firstOversizedField,
  isCoarseGeohash,
  verifyProof,
  type SignedProof,
} from "@proof/core";
import { env } from "./env.js";
import {
  addAttestation,
  allProofs,
  getProof,
  setReview,
  setPreciseLocationCipher,
  setVerifiedAttribute,
  setVerifiedPerson,
  upsertProof,
} from "./store.js";
import { pushRegistrationCount, registerPushToken } from "./push-store.js";
import { submitAttestation } from "./relayer.js";
import { checkLivenessVerdict, fetchVerifiedAttribute } from "./assurance.js";
import { sendVerifyUrl, type Channel } from "./channels.js";
import { maybeNotify } from "./notify.js";
import {
  isReviewStatus,
  requireCoordinator,
  REVIEW_NOTE_MAX,
  toCoordinatorRow,
  toCsv,
} from "./coordinator.js";

const VERIFY_BASE = process.env.VERIFY_BASE_URL ?? "http://localhost:3000";
// MAX_RECIPIENT_LEN: cap for /notify's `to`. An e.164 number is ~16 and the longest legal email
// address is 254; 320 leaves room for either without letting an unauthenticated caller push an
// arbitrarily large string into a provider request.
const MAX_RECIPIENT_LEN = 320;
const CHANNELS: Channel[] = ["whatsapp", "email", "telegram"];

// readJsonObject: the one place a request body is parsed. Returns null for anything that is not
// a JSON object — unparseable bytes, but also the literal `null`, a bare string or a number.
// Guarding the parse alone is not enough: `JSON.parse("null")` succeeds, and the property access
// that follows throws, which Hono reports as a 500. Every POST route here is unauthenticated,
// so the body must never be able to choose the status code.
async function readJsonObject(c: { req: { json: () => Promise<unknown> } }): Promise<Record<string, unknown> | null> {
  let parsed: unknown;
  try {
    parsed = await c.req.json();
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
  return parsed as Record<string, unknown>;
}

const app = new Hono();

app.get("/health", (c) => c.json({ ok: true, chainId: env.chainId }));

app.post("/sync", async (c) => {
  // `reportId` is an OPTIONAL top-level field (NOT inside SignedProof, NOT signed) that groups
  // the 1..N photos of one field report so the programme team gets ONE notification per report.
  const raw = await readJsonObject(c);
  if (!raw) return c.json({ error: "invalid json" }, 400);
  const body = raw as unknown as SignedProof & { reportId?: string };
  if (!verifyProof(body)) return c.json({ error: "invalid signature" }, 400);

  // Trust boundary for location precision. The geohash is inside the signed payload, so the
  // api cannot trim it without invalidating the signature — an over-precise cell is rejected
  // instead, which is what keeps a fine cell off-chain. Clients coarsen before signing.
  if (!isCoarseGeohash(body.geohash)) {
    return c.json({ error: "geohash too precise", maxLength: COARSE_GEOHASH_LEN }, 400);
  }

  // Size caps on the signed fields. These travel into EAS calldata, which the relayer pays gas
  // for per byte, and into the durable store — and the signature is from a self-generated key,
  // so the caller is unauthenticated. Like an over-precise geohash, an oversized signed field
  // cannot be trimmed without invalidating the signature, so it is rejected.
  const oversized = firstOversizedField(body);
  if (oversized) {
    return c.json({ error: `${oversized.field} too long`, maxLength: oversized.maxLength }, 413);
  }

  const payload = { proofHash: body.proofHash, taskId: body.taskId, geohash: body.geohash, capturedAt: body.capturedAt };
  const reportId =
    typeof body.reportId === "string" && body.reportId && body.reportId.length <= MAX_REPORT_ID_LEN
      ? body.reportId
      : undefined;
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
  // Same guard every other POST route uses: a malformed body is the caller's error (400), not
  // the server's (500). This route is unauthenticated, so the parse must never be the thing
  // that decides the status code.
  const body = await readJsonObject(c);
  if (!body) return c.json({ error: "invalid json" }, 400);
  const proofHash = typeof body.proofHash === "string" ? body.proofHash : "";
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
  const body = await readJsonObject(c);
  if (!body) return c.json({ error: "invalid json" }, 400);
  const proofHash = typeof body.proofHash === "string" ? body.proofHash : "";
  const channel = body.channel as Channel;
  const to = typeof body.to === "string" ? body.to : "";
  if (!getProof(proofHash)) return c.json({ error: "unknown proofHash" }, 404);
  if (!CHANNELS.includes(channel)) return c.json({ error: "unknown channel" }, 400);
  if (!to) return c.json({ error: "missing recipient" }, 400);
  // The recipient is relayed verbatim into a provider request. Nothing else caps it, and this
  // route is unauthenticated, so an unbounded `to` is unbounded outbound payload.
  if (to.length > MAX_RECIPIENT_LEN) {
    return c.json({ error: "recipient too long", maxLength: MAX_RECIPIENT_LEN }, 413);
  }

  const url = `${VERIFY_BASE}/verify/${proofHash}`;
  const result = await sendVerifyUrl(channel, to, url);
  return c.json({ sent: result.available, result });
});

app.post("/verify-identity", async (c) => {
  const raw = await readJsonObject(c);
  if (!raw) return c.json({ error: "invalid json" }, 400);
  const body = raw as {
    proofHash?: string;
    attribute?: string;
    subjectRef?: string;
    frames?: unknown;
    nonceHex?: string;
    challenges?: unknown;
  };

  // Liveness mode: selfie frames, no proofHash yet. The verdict is attached later via
  // /liveness-result. Only a boolean is returned; frames are never stored or logged.
  if (Array.isArray(body.frames)) {
    const result = await checkLivenessVerdict({
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

  const result = await fetchVerifiedAttribute({ attribute: body.attribute, subjectRef: body.subjectRef });

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
  const raw = await readJsonObject(c);
  if (!raw) return c.json({ error: "invalid json" }, 400);
  const body = raw as { proofHash?: string; verifiedPerson?: unknown; degraded?: unknown };
  if (!body.proofHash) return c.json({ error: "missing proofHash" }, 400);
  const ok = setVerifiedPerson(body.proofHash, body.verifiedPerson === true, body.degraded === true);
  if (!ok) return c.json({ error: "unknown proofHash" }, 404);
  return c.json({ status: "recorded", verifiedPerson: body.verifiedPerson === true }, 200);
});

// MAX_CIPHER_LEN: hex cap for the opaque precise-location blob. ephPub(32) + nonce(24) +
// a small JSON plaintext + tag is well under 512 bytes -> 1024 hex chars is generous.
const MAX_CIPHER_LEN = 4096;

app.post("/precise-location", async (c) => {
  const body = await readJsonObject(c);
  if (!body) return c.json({ error: "invalid json" }, 400);
  const proofHash = typeof body.proofHash === "string" ? body.proofHash : "";
  const cipher = typeof body.cipher === "string" ? body.cipher : "";
  if (!proofHash || !cipher) return c.json({ error: "missing proofHash or cipher" }, 400);
  if (cipher.length > MAX_CIPHER_LEN) return c.json({ error: "cipher too large" }, 413);
  // Stored opaque: never decoded, never parsed, never returned by a public route.
  const ok = setPreciseLocationCipher(proofHash, cipher);
  if (!ok) return c.json({ error: "unknown proofHash" }, 404);
  return c.json({ status: "stored" }, 200);
});

app.post("/register-push", async (c) => {
  const body = await readJsonObject(c);
  if (!body) return c.json({ error: "invalid json" }, 400);
  // proofOwnerRef is intentionally ignored: tokens are never linked to a proof or an identity.
  if (!registerPushToken(body.deviceId, body.token)) {
    return c.json({ error: "invalid deviceId or token" }, 400);
  }
  return c.json({ registered: true, count: pushRegistrationCount() }, 200);
});

// REGION_PREFIX_LEN: how many geohash chars leave the api. 5 ≈ ~5 km cell, never exact GPS.
// /sync now rejects anything finer, so new entries are already coarse; this slice stays as
// defence in depth for entries stored before that check existed.
const REGION_PREFIX_LEN = COARSE_GEOHASH_LEN;

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
    // True when the verdict above reflects a degraded provider, not an actual failed check.
    // Additive, nullable: absent/null when no verdict was ever attached.
    verifiedPersonDegraded:
      typeof entry.verifiedPerson === "boolean" ? entry.verifiedPersonDegraded === true : null,
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

// --- Coordinator surface -----------------------------------------------------------------
// Everything below requires an active coordinator_pro entitlement, checked server-side on every
// request. Reporters never reach these routes and never pay; see docs/pilot_engagement.md.
// These routes add review state on top of the public data — they never add a reporter identity,
// a precise location, a signature or a public key.

app.use("/coordinator/*", requireCoordinator);

app.get("/coordinator/reports", (c) =>
  c.json(allProofs().map((e) => toCoordinatorRow(e, REGION_PREFIX_LEN))),
);

app.post("/coordinator/review", async (c) => {
  const body = await readJsonObject(c);
  if (!body) return c.json({ error: "invalid json" }, 400);

  const proofHash = typeof body.proofHash === "string" ? body.proofHash : "";
  if (!proofHash) return c.json({ error: "missing proofHash" }, 400);
  if (!isReviewStatus(body.status)) {
    return c.json({ error: "invalid status", allowed: ["pending", "accepted", "rejected"] }, 400);
  }

  const note = typeof body.note === "string" ? body.note : "";
  if (note.length > REVIEW_NOTE_MAX) {
    return c.json({ error: "note too long", maxLength: REVIEW_NOTE_MAX }, 413);
  }

  const recorded = setReview(proofHash, {
    status: body.status,
    note,
    reviewedAt: new Date().toISOString(),
  });
  if (!recorded) return c.json({ error: "unknown proofHash" }, 404);

  const entry = getProof(proofHash)!;
  return c.json({ status: "recorded", review: toCoordinatorRow(entry, REGION_PREFIX_LEN) }, 200);
});

app.get("/coordinator/export.csv", (c) => {
  const csv = toCsv(allProofs().map((e) => toCoordinatorRow(e, REGION_PREFIX_LEN)));
  return new Response(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="prufture-reports.csv"',
    },
  });
});

// Skip binding a socket under `node --test` so the HTTP surface can be exercised via app.request.
if (!process.env.NODE_TEST_CONTEXT) {
  serve({ fetch: app.fetch, port: env.port }, (i) => console.log(`api on :${i.port}`));
}

export { app };
