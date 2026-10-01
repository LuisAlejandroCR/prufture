// index.ts: the api's HTTP surface — public, unauthenticated proof routes (/sync, /attest, /notify,
// assurance, /proof, /proof/:hash/confirmations, sealed /evidence) plus the PAID /coordinator/* routes
// gated by a server-side RevenueCat check. Every public route is zero-PII, and no request body can
// choose the status code or the recipient. Evidence photos are opaque ciphertext here and never leave
// via a public route.
import { serve } from "@hono/node-server";
import { Hono, type Context } from "hono";
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
  addNullifier,
  allProofs,
  getPersonhoodGroup,
  getProof,
  hasNullifier,
  putPersonhoodGroup,
  setMembershipVerified,
  setReview,
  setPreciseLocationCipher,
  setVerifiedPerson,
  upsertProof,
} from "./store.js";
import { pushNoticesConfigured, sendProgrammeNotice } from "./onesignal.js";
import { attestOnce } from "./relayer.js";
import { taskReports } from "./confirmations.js";
import {
  checkLivenessVerdict,
  createLivenessSession,
  livenessSessionVerdict,
  selectedLivenessSessionPort,
} from "./assurance.js";
import { isSessionId } from "./liveness-aws.js";
import { claimLivenessSession, releaseLivenessSession, rememberLivenessSession } from "./liveness-sessions.js";
import { clientKey, takeLivenessSessionSlot } from "./liveness-rate-limit.js";
import {
  POLICY_VERSION,
  enrolCommitment,
  expectedScope,
  isCommitment,
  isProgrammeId,
  personhoodEnabled,
  storeNullifiers,
  verifyMembership,
} from "./personhood.js";
import { sendVerifyUrl, type Channel } from "./channels.js";
import { issueTicket, readTicket } from "./liveness-ticket.js";
import { maybeNotify } from "./notify.js";
import {
  APP_USER_HEADER,
  isReviewStatus,
  requireCoordinator,
  REVIEW_NOTE_MAX,
  toCoordinatorRow,
  toCsv,
} from "./coordinator.js";
import { coordinatorEntitlementId } from "./entitlement.js";
import { SAMPLE_HEADER, sampleRows, setSampleReview } from "./coordinator-sample.js";
import { isCodeShaped, isJoinedStaff, tryJoin } from "./coordinator-join.js";
import { evidenceStorage } from "./evidence-storage.js";
import {
  MAX_REQUEST_CHECK,
  decodeSealedBlob,
  evidenceKey,
  evidenceState,
  isEvidenceToken,
  isProofHash,
  keepToken,
  maxBase64Len,
  purgeExpiredEvidence,
  tokenMatches,
} from "./evidence.js";
import { getEvidenceRecord, putEvidenceRecord } from "./store.js";

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
// bounds what a coordinator (or a leaked coordinator id) can make the programme pay for. In memory on purpose: a
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
  // One sealed photo, base64, plus a few bytes of JSON. EVIDENCE_MAX_BYTES caps the decoded blob.
  if (c.req.path === "/evidence") {
    const maxSize = maxBase64Len(env.evidenceMaxBytes) + 1024;
    return bodyLimit({ maxSize, onError: tooLarge })(c, next);
  }
  return bodyLimit({ maxSize: MAX_BODY_BYTES, onError: tooLarge })(c, next);
});

// `coordinatorBilling` says only whether the RevenueCat secret, project and entitlement id are set,
// so a deploy can be checked before App Review opens the coordinator screen. It never echoes them.
app.get("/health", (c) =>
  c.json({
    ok: true,
    chainId: env.chainId,
    coordinatorBilling: Boolean(env.revenuecatSecretKey && env.revenuecatProjectId && coordinatorEntitlementId()),
    // Whether the programme pass is checked at all (PERSONHOOD_PROVIDER=semaphore). Off means no
    // report carries a pass, so no community confirmation can be reached.
    programmePass: personhoodEnabled(),
    // Whether anyone may enrol members (PERSONHOOD_ADMIN_APP_USER_IDS); never who.
    personhoodEnrolment: env.personhoodAdminAppUserIds.length > 0,
    // Whether PROGRAMME_STAFF_APP_USER_IDS lists anyone; never who. False means only the enrolment
    // admins see real reports in Coordinator review, and every other subscriber sees the sample.
    programmeStaff: (process.env.PROGRAMME_STAFF_APP_USER_IDS ?? "").split(",").some((s: string) => s.trim() !== ""),
    // REQUIRE_EVIDENCE_TOKEN: public writes without the syncing phone's token are refused.
    strictEvidenceToken: env.requireEvidenceToken,
    // OneSignal programme notices are configured (ONESIGNAL_APP_ID and ONESIGNAL_REST_API_KEY); never the key.
    pushNotices: pushNoticesConfigured(),
  }),
);

app.post("/sync", async (c) => {
  // `reportId` is an OPTIONAL top-level field (NOT inside SignedProof, NOT signed) that groups
  // the 1..N photos of one field report so the programme team gets ONE notification per report.
  const raw = await readJsonObject(c);
  if (!raw) return c.json({ error: "invalid json" }, 400);
  const body = raw as unknown as SignedProof & { reportId?: string; evidenceTokenHash?: unknown };
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
  const firstSync = !getProof(payload.proofHash);
  upsertProof(payload, reportId);
  // Evidence token, FIRST sync only: until the device syncs, the proofHash exists nowhere else, so
  // the first registration is the device's. A later /sync of the now-public proof (anyone can replay
  // it) can never set or change the token hash.
  if (firstSync && isEvidenceToken(body.evidenceTokenHash)) {
    putEvidenceRecord(payload.proofHash, { ...getEvidenceRecord(payload.proofHash), tokenHash: body.evidenceTokenHash });
  }

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

// A manual re-send is a programme-team action: an anonymous caller could walk /proofs and make the
// programme pay for one message per proof and channel every cooldown window. No client calls it;
// automatic delivery on /sync and /attest (maybeNotify) is unaffected.
app.use("/notify", requireCoordinator);
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
  const body = raw as { frames?: unknown; nonceHex?: unknown; challenges?: unknown };

  // Liveness only. The verified-attribute mode was removed: its attribute was not bound to the
  // proof's reporter and could be re-attached. Its replacement is the planned openid4vp flow.
  if (!Array.isArray(body.frames)) return c.json({ error: "liveness frames required" }, 400);

  // No proofHash yet: the verdict is attached later via /liveness-result. Frames are never stored.
  const result = await checkLivenessVerdict({
    frames: body.frames.map(String),
    nonceHex: String(body.nonceHex ?? ""),
    challenges: Array.isArray(body.challenges) ? body.challenges.map(String) : [],
  });
  // The ticket is what /liveness-result records; the booleans are for the app's own screen.
  const verdict = result.available
    ? { verifiedPerson: result.data.verifiedPerson, degraded: false }
    : { verifiedPerson: false, degraded: true };
  return c.json({ ...verdict, ticket: issueTicket(verdict) }, 200);
});

/**
 * True when a write keyed by a public proofHash must be refused because the caller is not the device
 * that first synced the proof. Without it anyone could stamp data on someone else's report, or lock
 * out the real data (these writes are write-once). That device holds the proof's evidence token. A
 * wrong token is always refused; a missing one only with REQUIRE_EVIDENCE_TOKEN, since older builds
 * do not send it. A proof synced without a token hash has nothing to prove against.
 */
function ownerRefused(proofHash: string, token: unknown): boolean {
  const rec = getEvidenceRecord(proofHash);
  if (!rec?.tokenHash) return false;
  return token !== undefined ? !tokenMatches(rec, token) : env.requireEvidenceToken;
}

app.post("/liveness-result", async (c) => {
  const raw = await readJsonObject(c);
  if (!raw) return c.json({ error: "invalid json" }, 400);
  const body = raw as { proofHash?: unknown; ticket?: unknown; evidenceToken?: unknown };
  const proofHash = typeof body.proofHash === "string" ? body.proofHash : "";
  if (!proofHash) return c.json({ error: "missing proofHash" }, 400);
  // The verdict comes from the server-signed ticket /verify-identity issued, never from the
  // body: this route is unauthenticated and its result is shown on the public /verify page.
  const verdict = readTicket(body.ticket);
  if (!verdict) return c.json({ error: "missing or invalid liveness ticket" }, 400);

  const entry = getProof(proofHash);
  if (!entry) return c.json({ error: "unknown proofHash" }, 404);
  // A ticket is not bound to a proof: see ownerRefused.
  if (ownerRefused(proofHash, body.evidenceToken)) return c.json({ error: "evidence token required" }, 403);
  // Write-once. A retry of the same verdict is fine; a different one cannot replace it.
  if (typeof entry.verifiedPerson === "boolean") {
    const same = entry.verifiedPerson === verdict.verifiedPerson && (entry.verifiedPersonDegraded === true) === verdict.degraded;
    if (!same) return c.json({ error: "a liveness verdict is already recorded for this proof" }, 409);
  } else {
    setVerifiedPerson(proofHash, verdict.verifiedPerson, verdict.degraded);
  }
  return c.json({ status: "recorded", verifiedPerson: verdict.verifiedPerson }, 200);
});

// Session-flow liveness (LIVENESS_PROVIDER=aws). The device captures against the provider
// directly; the api only opens the session and asks for the verdict. Neither route returns or
// logs the provider's error text, confidence, images or raw response — result.error stays here.
app.post("/liveness/session", async (c) => {
  // Off costs nothing, so it answers before the spend guard and never burns a slot.
  if (!selectedLivenessSessionPort()) return c.json({ error: "liveness unavailable", degraded: true }, 503);
  // Each session is billed by the provider: per-IP bucket plus a global daily cap, typed-degraded.
  const slot = takeLivenessSessionSlot(clientKey(c.req.header("x-forwarded-for")));
  if (!slot.ok) {
    c.header("Retry-After", String(slot.retryAfterSec));
    return c.json({ error: "liveness rate limited", degraded: true }, 429);
  }
  const r = await createLivenessSession();
  if (!r.available) return c.json({ error: "liveness unavailable", degraded: true }, 503);
  rememberLivenessSession(r.data.sessionId);
  return c.json({ sessionId: r.data.sessionId }, 200);
});

app.post("/liveness/result", async (c) => {
  const raw = await readJsonObject(c);
  if (!raw) return c.json({ error: "invalid json" }, 400);
  const sessionId = (raw as { sessionId?: unknown }).sessionId;
  if (!isSessionId(sessionId)) return c.json({ error: "invalid sessionId" }, 400);

  const degradedTicket = () => {
    const verdict = { verifiedPerson: false, degraded: true };
    return c.json({ ...verdict, ticket: issueTicket(verdict) }, 200);
  };
  // Liveness off: nothing to claim, same degrade as /verify-identity.
  if (!selectedLivenessSessionPort()) return degradedTicket();
  // Single use: only a session this server opened, and only once. A replayed, unknown or expired id
  // is a failed check, so one passed face check can never mint a second verified ticket.
  if (!claimLivenessSession(sessionId)) {
    const verdict = { verifiedPerson: false, degraded: false };
    return c.json({ ...verdict, ticket: issueTicket(verdict) }, 200);
  }

  const r = await livenessSessionVerdict(sessionId);
  // Same degrade as /verify-identity: a typed unavailable becomes a degraded ticket, never a 5xx.
  // The id goes back so the device can ask again once the provider recovers.
  if (!r.available) {
    releaseLivenessSession(sessionId);
    return degradedTicket();
  }
  const verifiedPerson = r.data.verifiedPerson === true;
  return c.json({ verifiedPerson, ticket: issueTicket({ verifiedPerson, degraded: false }) }, 200);
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
  // The programme key is public, so anyone can seal a plausible fake point: see ownerRefused.
  if (ownerRefused(proofHash, body.evidenceToken)) return c.json({ error: "evidence token required" }, 403);
  // Write-once: this route is unauthenticated, so without it anyone could replace a proof's
  // sealed location with garbage. Re-sending the identical blob (an app retry) is accepted.
  if (entry.preciseLocationCipher !== undefined && entry.preciseLocationCipher !== cipher) {
    return c.json({ error: "a precise location is already stored for this proof" }, 409);
  }
  // Stored opaque: never decoded, never parsed, never returned by a public route.
  setPreciseLocationCipher(proofHash, cipher);
  return c.json({ status: "stored" }, 200);
});

// Sealed evidence photos. The app sends one only when the reporter opted in for that report or
// approved a coordinator's request; it is sealed on the device to the programme key, so this route
// receives opaque ciphertext. It is never shown on /proof, /verify, on-chain or in a notification.
app.post("/evidence", async (c) => {
  const body = await readJsonObject(c);
  if (!body) return c.json({ error: "invalid json" }, 400);
  const proofHash = body.proofHash;
  if (!isProofHash(proofHash)) return c.json({ error: "invalid proofHash" }, 400);
  if (!getProof(proofHash)) return c.json({ error: "unknown proofHash" }, 404);
  // Proof hashes are public; only the device that first synced this proof holds its token.
  if (!tokenMatches(getEvidenceRecord(proofHash), body.token)) {
    return c.json({ error: "evidence token required" }, 403);
  }

  const decoded = decodeSealedBlob(body.cipher);
  if (!decoded.ok) {
    return c.json({ error: decoded.error, maxBytes: env.evidenceMaxBytes }, decoded.status);
  }

  // Write-once, like /precise-location: the route is unauthenticated, so a stored photo cannot be
  // replaced. The identical blob again (an app retry) is accepted.
  const rec = getEvidenceRecord(proofHash);
  if (rec?.purgedAt) return c.json({ error: "retention period ended for this proof" }, 410);
  if (rec?.storedAt) {
    if (rec.cipherSha256 === decoded.sha256) return c.json({ status: "stored", duplicate: true }, 200);
    return c.json({ error: "evidence is already stored for this proof" }, 409);
  }

  const result = await evidenceStorage().put(evidenceKey(proofHash), decoded.bytes);
  if (!result.available) return c.json({ stored: false, result }, 503);
  putEvidenceRecord(proofHash, {
    ...(rec?.requestedAt ? { requestedAt: rec.requestedAt } : {}),
    ...keepToken(rec),
    storedAt: new Date().toISOString(),
    bytes: decoded.bytes.length,
    cipherSha256: decoded.sha256,
  });
  return c.json({ status: "stored", duplicate: false }, 200);
});

// The app asks which of ITS proofs a coordinator has requested photos for. Body, not URL, so the
// list of hashes stays out of access logs. Returns hashes only; the reporter decides in the app.
app.post("/evidence-requests", async (c) => {
  const body = await readJsonObject(c);
  if (!body) return c.json({ error: "invalid json" }, 400);
  if (!Array.isArray(body.proofs)) return c.json({ error: "proofs must be an array" }, 400);
  if (body.proofs.length > MAX_REQUEST_CHECK) {
    return c.json({ error: "too many proofs", max: MAX_REQUEST_CHECK }, 413);
  }
  // Each hash must come with its evidence token: a request is only revealed to the reporter's device,
  // never to someone probing public proof hashes for which reports are under review.
  const requested = (body.proofs as unknown[])
    .map((p) => (p && typeof p === "object" ? (p as { proofHash?: unknown; token?: unknown }) : {}))
    .filter((p): p is { proofHash: string; token: unknown } => isProofHash(p.proofHash))
    .filter((p) => {
      const rec = getEvidenceRecord(p.proofHash);
      return tokenMatches(rec, p.token) && evidenceState(rec) === "requested";
    })
    .map((p) => p.proofHash);
  return c.json({ requested: [...new Set(requested)] }, 200);
});

// REGION_PREFIX_LEN: how many geohash chars leave the api. 5 ≈ ~5 km cell, never exact GPS.
// /sync now rejects anything finer, so new entries are already coarse; this slice stays as
// defence in depth for entries stored before that check existed.
const REGION_PREFIX_LEN = COARSE_GEOHASH_LEN;

// Personhood (Semaphore v4 group membership). Off unless PERSONHOOD_PROVIDER=semaphore.
// The group's commitments are public by design (the device needs them to build its Merkle path);
// nullifiers are never returned by any route.

app.get("/personhood/group/:programmeId", (c) => {
  const programmeId = c.req.param("programmeId");
  if (!isProgrammeId(programmeId)) return c.json({ error: "invalid programmeId" }, 400);
  const group = getPersonhoodGroup(programmeId);
  if (!group) return c.json({ error: "unknown programme" }, 404);
  return c.json({
    programmeId,
    epoch: group.epoch,
    commitments: group.commitments,
    root: group.roots.at(-1) ?? null,
  });
});

// The scope a device must bind its proof to. Computed here, from the stored report's taskId and the
// group's current epoch, so the app never guesses epoch or policyVersion. Scope and epoch only:
// no nullifier, commitment or report field leaves this route.
app.get("/personhood/scope", (c) => {
  const programmeId = c.req.query("programmeId");
  if (!isProgrammeId(programmeId)) return c.json({ error: "invalid programmeId" }, 400);
  const entry = getProof(c.req.query("proofHash") ?? "");
  if (!entry) return c.json({ error: "unknown proofHash" }, 404);
  const group = getPersonhoodGroup(programmeId);
  if (!group) return c.json({ error: "unknown programme" }, 404);
  const scope = expectedScope({
    programmeId,
    taskId: entry.payload.taskId,
    epoch: BigInt(group.epoch),
    policyVersion: POLICY_VERSION,
  });
  return c.json({ scope: scope.toString(), epoch: group.epoch }, 200);
});

app.post("/personhood/proof", async (c) => {
  const body = await readJsonObject(c);
  if (!body) return c.json({ error: "invalid json" }, 400);
  const proofHash = typeof body.proofHash === "string" ? body.proofHash : "";
  if (!isProgrammeId(body.programmeId)) return c.json({ error: "invalid programmeId" }, 400);
  const entry = getProof(proofHash);
  if (!entry) return c.json({ error: "unknown proofHash" }, 404);
  const group = getPersonhoodGroup(body.programmeId);
  if (!group) return c.json({ error: "unknown programme" }, 404);

  // taskId comes from the stored signed payload and epoch from the server, never from the body:
  // a caller-chosen scope would mint a fresh nullifier and defeat "once per task".
  const scope = expectedScope({
    programmeId: body.programmeId,
    taskId: entry.payload.taskId,
    epoch: BigInt(group.epoch),
    policyVersion: POLICY_VERSION,
  });
  const result = await verifyMembership(
    { proof: body.proof, proofHash, scope, acceptedRoots: group.roots },
    { nullifiers: storeNullifiers({ hasNullifier, addNullifier }) },
  );
  if (result.state === "verified") setMembershipVerified(proofHash);
  // The reason code (e.g. unknown_root, bad_proof) stays server-side; the log carries only it, the
  // state and a short public report prefix, never proof material, a nullifier or a commitment.
  const report = proofHash.replace(/^0x/, "").slice(0, 12);
  console.log(`personhood ${JSON.stringify({ report, state: result.state, reason: result.reason })}`);
  return c.json({ state: result.state }, 200);
});

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
    // Selfie liveness verdict. null until a result is attached. Boolean only, never an identity field.
    verifiedPerson: typeof entry.verifiedPerson === "boolean" ? entry.verifiedPerson : null,
    // True when the verdict above reflects a degraded provider, not an actual failed check.
    // Additive, nullable: absent/null when no verdict was ever attached.
    verifiedPersonDegraded:
      typeof entry.verifiedPerson === "boolean" ? entry.verifiedPersonDegraded === true : null,
    // Additive: "verified" once a group-membership proof was accepted for this report, else null.
    membership: entry.membership ?? null,
  });
});

// Independent reports for the same task as :hash, so the reporter's phone can show honest community
// progress. Counts are decided on the phone (apps/frontend/src/confirmations.ts); this only groups.
app.get("/proof/:hash/confirmations", (c) => {
  const reports = taskReports(allProofs(), c.req.param("hash"), REGION_PREFIX_LEN);
  if (!reports) return c.json({ error: "not found" }, 404);
  return c.json({ reports });
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
// request. Adds review state only — never a reporter identity, a
// precise location, a signature or a public key.

app.use("/coordinator/*", requireCoordinator);

/** Staff of the programme review its real reports; any other subscriber gets a sample inbox. */
function isProgrammeStaff(c: Context): boolean {
  const caller = c.req.header(APP_USER_HEADER)?.trim() ?? "";
  return caller !== "" && (env.programmeStaffAppUserIds.includes(caller) || isJoinedStaff(caller));
}

// A coordinator joins the staff with an invitation code from the programme team (coordinator-join.ts).
app.post("/coordinator/join", async (c) => {
  const body = await readJsonObject(c);
  if (!body) return c.json({ error: "invalid json" }, 400);
  if (!isCodeShaped(body.code)) return c.json({ error: "invalid code" }, 400);
  const outcome = tryJoin(c.req.header(APP_USER_HEADER)!.trim(), body.code);
  if (outcome === "limited") return c.json({ error: "too many attempts, try again later" }, 429);
  if (outcome === "invalid") return c.json({ error: "code not accepted" }, 403);
  return c.json({ staff: true }, 200);
});

// Asking a reporter for a photo, or fetching one, is programme work: never for a sample inbox.
app.use("/coordinator/evidence*", async (c, next) => {
  if (!isProgrammeStaff(c)) return c.json({ error: "programme staff required" }, 403);
  await next();
});

// Enrolment, coordinator-run: the coordinator adds a commitment the reporter shows them in person.
// The coordinator therefore knows whose commitment it is; the proofs are unlinkable to the api only.
// Enrolment decides who counts as a distinct member, which is what community confirmations rest on.
// coordinator_pro alone is not enough: any subscriber holds it and could enrol their own commitments
// or start a new round for any programme. Only the programme admins (the dashboard's account) may.
app.use("/coordinator/personhood/*", async (c, next) => {
  const caller = c.req.header(APP_USER_HEADER)?.trim() ?? "";
  if (!env.personhoodAdminAppUserIds.includes(caller)) {
    return c.json({ error: "programme admin required" }, 403);
  }
  await next();
});

app.post("/coordinator/personhood/enrol", async (c) => {
  const body = await readJsonObject(c);
  if (!body) return c.json({ error: "invalid json" }, 400);
  if (!isProgrammeId(body.programmeId)) return c.json({ error: "invalid programmeId" }, 400);
  if (!isCommitment(body.commitment)) return c.json({ error: "invalid commitment" }, 400);
  const { group, added } = enrolCommitment(getPersonhoodGroup(body.programmeId), body.commitment);
  if (added) putPersonhoodGroup(body.programmeId, group);
  return c.json({ added, size: group.commitments.length, epoch: group.epoch }, 200);
});

// Opens a new round: every enrolled member can prove once more per task.
app.post("/coordinator/personhood/epoch", async (c) => {
  const body = await readJsonObject(c);
  if (!body) return c.json({ error: "invalid json" }, 400);
  if (!isProgrammeId(body.programmeId)) return c.json({ error: "invalid programmeId" }, 400);
  const group = getPersonhoodGroup(body.programmeId);
  if (!group) return c.json({ error: "unknown programme" }, 404);
  putPersonhoodGroup(body.programmeId, { ...group, epoch: group.epoch + 1 });
  // Tell subscribed reporters they can confirm again. Fire-and-forget: a slow or failed notice never
  // holds or fails the round, and it names no programme or report.
  void sendProgrammeNotice({
    heading: "A new round has started",
    body: "You can confirm each activity once more. Open Prufture to see missions near you.",
  });
  return c.json({ epoch: group.epoch + 1 }, 200);
});

// coordinator_pro is sold to anyone, so the plan alone never opens the programme's reports.
app.get("/coordinator/reports", (c) => {
  if (!isProgrammeStaff(c)) {
    c.header(SAMPLE_HEADER, "1");
    return c.json(sampleRows(c.req.header(APP_USER_HEADER)!.trim()));
  }
  return c.json(allProofs().map((e) => toCoordinatorRow(e, REGION_PREFIX_LEN)));
});

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

  const review = { status: body.status, note, reviewedAt: new Date().toISOString() };
  // A subscriber reviews only their own sample rows; a real report answers like an unknown one, so
  // its existence is not confirmed. Staff never write a sample row into the real store.
  if (!isProgrammeStaff(c)) {
    c.header(SAMPLE_HEADER, "1");
    const row = setSampleReview(c.req.header(APP_USER_HEADER)!.trim(), proofHash, review);
    if (!row) return c.json({ error: "unknown proofHash" }, 404);
    return c.json({ status: "recorded", review: row }, 200);
  }
  const recorded = setReview(proofHash, review);
  if (!recorded) return c.json({ error: "unknown proofHash" }, 404);

  const entry = getProof(proofHash)!;
  return c.json({ status: "recorded", review: toCoordinatorRow(entry, REGION_PREFIX_LEN) }, 200);
});

app.get("/coordinator/export.csv", (c) => {
  const staff = isProgrammeStaff(c);
  const csv = toCsv(
    staff
      ? allProofs().map((e) => toCoordinatorRow(e, REGION_PREFIX_LEN))
      : sampleRows(c.req.header(APP_USER_HEADER)!.trim()),
  );
  return new Response(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="prufture-reports.csv"',
      ...(staff ? {} : { [SAMPLE_HEADER]: "1" }),
    },
  });
});

// Ask the reporter's app for one proof's photo. Nothing is uploaded until the reporter approves it
// in the app; a request nobody answers is dropped by the retention purge.
app.post("/coordinator/evidence-request", async (c) => {
  const body = await readJsonObject(c);
  if (!body) return c.json({ error: "invalid json" }, 400);
  const proofHash = body.proofHash;
  if (!isProofHash(proofHash)) return c.json({ error: "invalid proofHash" }, 400);
  if (!getProof(proofHash)) return c.json({ error: "unknown proofHash" }, 404);
  // A request the programme could never receive would only prompt the reporter for nothing.
  const storage = evidenceStorage();
  if (storage.kind === "none") {
    return c.json({ state: "unavailable", result: unavailable("evidence-storage", "evidence storage not configured") }, 503);
  }
  const rec = getEvidenceRecord(proofHash);
  const state = evidenceState(rec);
  if (state === "available") return c.json({ state }, 200);
  if (state !== "requested") {
    putEvidenceRecord(proofHash, { requestedAt: new Date().toISOString(), ...keepToken(rec) });
  }
  return c.json({ state: "requested" }, 200);
});

// The sealed blob, byte for byte. The coordinator opens it offline with the programme private key;
// this process has no key and cannot.
app.get("/coordinator/evidence/:proofHash", async (c) => {
  const proofHash = c.req.param("proofHash");
  if (!isProofHash(proofHash)) return c.json({ error: "invalid proofHash" }, 400);
  if (!getProof(proofHash)) return c.json({ error: "unknown proofHash" }, 404);
  const state = evidenceState(getEvidenceRecord(proofHash));
  if (state !== "available") return c.json({ error: "no evidence stored", state }, 404);
  const result = await evidenceStorage().get(evidenceKey(proofHash));
  if (!result.available) return c.json({ result }, 503);
  if (!result.data) return c.json({ error: "no evidence stored", state: "missing" }, 404);
  return new Response(result.data as unknown as ConstructorParameters<typeof Response>[0], {
    status: 200,
    headers: {
      "content-type": "application/octet-stream",
      "cache-control": "no-store",
      "x-evidence-seal": "x25519-hkdf-sha256-xchacha20poly1305-v1",
      "content-disposition": `attachment; filename="${proofHash}.sealed"`,
    },
  });
});

/** One retention pass. Exported for ops scripts; the server runs it on a timer. */
export function runEvidencePurge() {
  return purgeExpiredEvidence(evidenceStorage());
}

export const EVIDENCE_PURGE_INTERVAL_MS = 6 * 60 * 60 * 1000;

// Skip binding a socket under `node --test` so the HTTP surface can be exercised via app.request.
if (!process.env.NODE_TEST_CONTEXT) {
  serve({ fetch: app.fetch, port: env.port }, (i) => console.log(`api on :${i.port}`));
  const purge = () =>
    runEvidencePurge()
      .then((s) => {
        if (s.purged || s.failed || s.expiredRequests) console.log("evidence purge", s);
      })
      .catch(() => undefined);
  void purge();
  setInterval(purge, EVIDENCE_PURGE_INTERVAL_MS).unref();
}

export { app };
