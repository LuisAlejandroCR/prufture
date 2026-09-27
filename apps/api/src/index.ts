// index.ts: the api's HTTP surface — public, unauthenticated proof routes (/sync, /attest, /notify,
// assurance, /proof) plus the PAID /coordinator/* routes gated by a server-side RevenueCat check.
// Every public route is zero-PII, and no request body can choose the status code or the recipient.
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import {
  COARSE_GEOHASH_LEN,
  MAX_REPORT_ID_LEN,
  firstOversizedField,
  isCoarseGeohash,
  unavailable,
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
import { attestOnce } from "./relayer.js";
import { checkLivenessVerdict, fetchVerifiedAttribute } from "./assurance.js";
import { sendVerifyUrl, type Channel } from "./channels.js";
import { issueTicket, readTicket } from "./liveness-ticket.js";
import { maybeNotify } from "./notify.js";
import {
  isReviewStatus,
  requireCoordinator,
  REVIEW_NOTE_MAX,
  toCoordinatorRow,
  toCsv,
} from "./coordinator.js";

const VERIFY_BASE = process.env.VERIFY_BASE_URL ?? "http://localhost:3000";
const CHANNELS: Channel[] = ["whatsapp", "email", "telegram"];

// /notify is unauthenticated and proof hashes are public, so the recipient is never the caller's
// to choose: a caller-supplied `to` made the programme's own WhatsApp/email credentials an open
// relay to any number or address. It resolves to the fixed, env-configured programme recipient.
function programmeRecipient(channel: Channel): string {
  if (channel === "whatsapp") return env.programmeWhatsapp;
  if (channel === "email") return env.programmeEmail;
  return env.programmeTelegramChat;
}

// Even a fixed recipient can be spammed. One manual re-send per proof and channel per window
// bounds what an anonymous caller can make the programme pay for. In memory on purpose: a
// restart resetting it costs at most one extra message per proof.
export const NOTIFY_COOLDOWN_MS = 10 * 60 * 1000;
const lastManualNotify = new Map<string, number>();

// readJsonObject: the one place a request body is parsed. Returns null for anything that is not a
// JSON object — `JSON.parse("null")` succeeds and the property access after it would throw a 500.
// Every POST route is unauthenticated, so the body must never be able to choose the status code.
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

// Request body caps. Every route is reachable without auth and parses the whole body into
// memory, and /verify-identity forwards its frames to a provider, so an unbounded body is
// unbounded memory and unbounded outbound payload. Liveness frames are the one large input:
// three camera frames at quality 0.3, base64. Everything else is a few hundred bytes of JSON.
export const MAX_BODY_BYTES = 64 * 1024;
export const MAX_LIVENESS_BODY_BYTES = 8 * 1024 * 1024;
const tooLarge = (c: { json: (b: unknown, s: 413) => Response }) => c.json({ error: "payload too large" }, 413);
app.use("/verify-identity", bodyLimit({ maxSize: MAX_LIVENESS_BODY_BYTES, onError: tooLarge }));
app.use("*", async (c, next) => {
  if (c.req.path === "/verify-identity") return next();
  return bodyLimit({ maxSize: MAX_BODY_BYTES, onError: tooLarge })(c, next);
});

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
  // attestOnce: a re-sent proof this relayer already anchored reuses the stored record, no new tx.
  const attestation = await attestOnce(payload, getProof(payload.proofHash)?.attestations ?? []);
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
  // A malformed body is the caller's error (400), never the server's (500).
  const body = await readJsonObject(c);
  if (!body) return c.json({ error: "invalid json" }, 400);
  const proofHash = typeof body.proofHash === "string" ? body.proofHash : "";
  const entry = getProof(proofHash);
  if (!entry) return c.json({ error: "unknown proofHash" }, 404);

  // attestOnce: a repeat call for a proof this relayer already anchored costs no gas.
  const attestation = await attestOnce(entry.payload, entry.attestations);
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
  if (!getProof(proofHash)) return c.json({ error: "unknown proofHash" }, 404);
  if (!CHANNELS.includes(channel)) return c.json({ error: "unknown channel" }, 400);
  // Refuse rather than silently ignore, so an old client learns the contract changed.
  if ("to" in body) return c.json({ error: "recipient is fixed server-side; do not send `to`" }, 400);

  const to = programmeRecipient(channel);
  if (!to) {
    return c.json({ sent: false, result: unavailable(`channel/${channel}`, "no programme recipient configured") });
  }

  const key = `${proofHash}:${channel}`;
  const last = lastManualNotify.get(key);
  const now = Date.now();
  if (last !== undefined && now - last < NOTIFY_COOLDOWN_MS) {
    c.header("retry-after", String(Math.ceil((NOTIFY_COOLDOWN_MS - (now - last)) / 1000)));
    return c.json({ error: "already sent recently" }, 429);
  }

  const url = `${VERIFY_BASE}/verify/${proofHash}`;
  const result = await sendVerifyUrl(channel, to, url);
  // Only a delivered message starts the cooldown, so a degraded provider can be retried.
  if (result.available) lastManualNotify.set(key, now);
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
    // The ticket is what /liveness-result records; the booleans are for the app's own screen.
    const verdict = result.available
      ? { verifiedPerson: result.data.verifiedPerson, degraded: false }
      : { verifiedPerson: false, degraded: true };
    return c.json({ ...verdict, ticket: issueTicket(verdict) }, 200);
  }

  // Default mode: verified age attribute against an existing proof.
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
  const body = raw as { proofHash?: unknown; ticket?: unknown };
  const proofHash = typeof body.proofHash === "string" ? body.proofHash : "";
  if (!proofHash) return c.json({ error: "missing proofHash" }, 400);
  // The verdict comes from the server-signed ticket /verify-identity issued, never from the
  // body: this route is unauthenticated and its result is shown on the public /verify page.
  const verdict = readTicket(body.ticket);
  if (!verdict) return c.json({ error: "missing or invalid liveness ticket" }, 400);

  const entry = getProof(proofHash);
  if (!entry) return c.json({ error: "unknown proofHash" }, 404);
  // Write-once. A retry of the same verdict is fine; a different one cannot replace it.
  if (typeof entry.verifiedPerson === "boolean") {
    const same = entry.verifiedPerson === verdict.verifiedPerson && (entry.verifiedPersonDegraded === true) === verdict.degraded;
    if (!same) return c.json({ error: "a liveness verdict is already recorded for this proof" }, 409);
  } else {
    setVerifiedPerson(proofHash, verdict.verifiedPerson, verdict.degraded);
  }
  return c.json({ status: "recorded", verifiedPerson: verdict.verifiedPerson }, 200);
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
  const entry = getProof(proofHash);
  if (!entry) return c.json({ error: "unknown proofHash" }, 404);
  // Write-once: this route is unauthenticated, so without it anyone could replace a proof's
  // sealed location with garbage. Re-sending the identical blob (an app retry) is accepted.
  if (entry.preciseLocationCipher !== undefined && entry.preciseLocationCipher !== cipher) {
    return c.json({ error: "a precise location is already stored for this proof" }, 409);
  }
  // Stored opaque: never decoded, never parsed, never returned by a public route.
  setPreciseLocationCipher(proofHash, cipher);
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

// Coordinator surface: requires an active coordinator_pro entitlement, checked server-side on every
// request (see docs/pilot_engagement.md). Adds review state only — never a reporter identity, a
// precise location, a signature or a public key.

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
