// evidence-share.ts: the only path an evidence photo can take off the phone. A photo leaves when the
// reporter opted in for that report, or approved a coordinator's request — always sealed first by
// evidence-seal.ts, queued as ciphertext, and posted to /evidence on the sync pass. Pure, never throws.

import { hashBytes } from "@proof/core";
import { bytesToBase64, isProgrammeKey, sealEvidence } from "./evidence-seal";
import { evidenceTokenFor } from "./evidence-token";

/** Expo inlines EXPO_PUBLIC_* at build time. "" means photo sharing is not set up. */
export function programmePubKey(): string {
  return process.env.EXPO_PUBLIC_PROGRAMME_PUBKEY ?? "";
}

/** Days the server keeps a shared photo. Copy only; the server's EVIDENCE_RETENTION_DAYS decides. */
export function retentionDaysCopy(): number {
  const n = Number(process.env.EXPO_PUBLIC_EVIDENCE_RETENTION_DAYS);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 90;
}

/** True when this build can seal photos to a programme key. The review toggle is disabled otherwise. */
export function evidenceSharingAvailable(pubKey: string = programmePubKey()): boolean {
  return isProgrammeKey(pubKey);
}

/** Plain-language copy for the review-step toggle and the request prompt. */
export function shareCopy(days: number = retentionDaysCopy()) {
  return {
    toggleTitle: "Share photos with the programme team",
    toggleOff: "Off: your photos stay on this phone. Only a fingerprint of each photo is sent.",
    toggleOn: `On: your photos are locked on this phone so only the programme team can open them, then sent. They are deleted after ${days} days and never shown on the public page.`,
    unavailable: "Photo sharing is not set up for this programme. Your photos stay on this phone.",
    requestTitle: "The programme team asked to see the photos from this report",
    requestBody: `If you agree, the photos are locked on this phone so only the programme team can open them, then sent. They are deleted after ${days} days and never shown on the public page. You can say no; the report still counts.`,
    missing: "Some photos are no longer on this phone, so they cannot be shared.",
  };
}

interface OutboxItem {
  proofHash: string;
  /** base64 of sealEvidence() output. Ciphertext only — never plaintext. */
  cipher: string;
  queuedAt: number;
}

interface State {
  outbox: OutboxItem[];
  /** proofHashes whose photo the api has (or already had). */
  shared: string[];
  /** Requests the reporter said no to. Local only: never sent anywhere. */
  declined: string[];
  /** Coordinator requests waiting for the reporter's answer. */
  requests: string[];
}

const MAX_OUTBOX = 50;
const MAX_LIST = 500;
/** Matches the api's /evidence-requests cap. */
export const MAX_REQUEST_CHECK = 200;

/** Storage seam. The default backend is expo-file-system; unit tests inject an in-memory one. */
export interface EvidenceBackend {
  read(): Promise<string | null>;
  write(text: string): Promise<void>;
}

let injected: EvidenceBackend | null = null;
let deviceBackend: EvidenceBackend | null = null;

/** Test seam: swap the storage backend. Pass null to restore the device default. */
export function __setEvidenceBackend(b: EvidenceBackend | null): void {
  injected = b;
}

async function backend(): Promise<EvidenceBackend | null> {
  if (injected) return injected;
  if (deviceBackend) return deviceBackend;
  try {
    const { Paths, File, Directory } = await import("expo-file-system");
    const dir = new Directory(Paths.document, "evidence-share");
    const file = () => new File(dir, "state.json");
    deviceBackend = {
      async read() {
        const f = file();
        return f.exists ? await f.text() : null;
      },
      async write(text) {
        if (!dir.exists) dir.create({ intermediates: true });
        const f = file();
        if (!f.exists) f.create();
        f.write(text);
      },
    };
    return deviceBackend;
  } catch {
    return null;
  }
}

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

async function readState(): Promise<State> {
  const empty: State = { outbox: [], shared: [], declined: [], requests: [] };
  try {
    const store = await backend();
    const text = store ? await store.read() : null;
    if (!text) return empty;
    const p = JSON.parse(text) as Partial<State>;
    return {
      outbox: Array.isArray(p.outbox)
        ? p.outbox.filter(
            (o): o is OutboxItem => !!o && typeof o.proofHash === "string" && typeof o.cipher === "string",
          )
        : [],
      shared: strings(p.shared),
      declined: strings(p.declined),
      requests: strings(p.requests),
    };
  } catch {
    return empty;
  }
}

async function writeState(s: State): Promise<void> {
  try {
    const store = await backend();
    if (!store) return;
    await store.write(
      JSON.stringify({
        outbox: s.outbox.slice(-MAX_OUTBOX),
        shared: s.shared.slice(-MAX_LIST),
        declined: s.declined.slice(-MAX_LIST),
        requests: s.requests.slice(-MAX_LIST),
      }),
    );
  } catch {
    // Non-fatal: nothing leaves the phone without being in the outbox, so a lost write shares less, never more.
  }
}

/**
 * Seal one photo for upload. Refuses (throws) when there is no valid programme key or the bytes are
 * not the photo this proof was made from — so the only thing that can be queued is ciphertext of the
 * exact evidence the reporter signed.
 */
export function sealPhotoForProof(pubKey: string, proofHash: string, photo: Uint8Array): string {
  if (!isProgrammeKey(pubKey)) throw new Error("photo sharing is not set up");
  if (hashBytes(photo) !== proofHash) throw new Error("photo does not match this report");
  return bytesToBase64(sealEvidence(pubKey, photo));
}

/**
 * Opt-in path (review step toggle on): seal every photo of the saved report and queue the ciphertext.
 * Returns how many were queued. With no programme key nothing is queued. Never throws.
 */
export async function queueOptInEvidence(
  items: { proofHash: string; bytes: Uint8Array }[],
  pubKey: string = programmePubKey(),
): Promise<number> {
  if (!evidenceSharingAvailable(pubKey) || items.length === 0) return 0;
  const state = await readState();
  let queued = 0;
  for (const it of items) {
    if (state.outbox.some((o) => o.proofHash === it.proofHash) || state.shared.includes(it.proofHash)) continue;
    try {
      state.outbox.push({ proofHash: it.proofHash, cipher: sealPhotoForProof(pubKey, it.proofHash, it.bytes), queuedAt: Date.now() });
      queued += 1;
    } catch {
      // A photo that cannot be sealed is simply not shared.
    }
  }
  if (queued > 0) await writeState(state);
  return queued;
}

export interface FlushSummary {
  sent: number;
  kept: number;
  dropped: number;
}

/**
 * POST every queued sealed photo to /evidence. 200/409 -> shared; 410/400 -> dropped (retention
 * over, or refused); 404 (proof not synced yet), 503 (storage off) or offline -> kept for the next
 * pass. Never throws.
 */
export async function flushEvidenceOutbox(apiUrl: string, fetchImpl: typeof fetch): Promise<FlushSummary> {
  const summary: FlushSummary = { sent: 0, kept: 0, dropped: 0 };
  const state = await readState();
  if (state.outbox.length === 0) return summary;
  const base = apiUrl.replace(/\/+$/, "");
  const keep: OutboxItem[] = [];
  for (const item of state.outbox) {
    // Without this proof's token the api refuses the upload, so wait for the secret store instead.
    const token = await evidenceTokenFor(item.proofHash);
    if (!token) {
      summary.kept += 1;
      keep.push(item);
      continue;
    }
    let status = 0;
    try {
      const res = await fetchImpl(`${base}/evidence`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ proofHash: item.proofHash, token, cipher: item.cipher }),
      });
      status = res.status;
    } catch {
      status = 0;
    }
    if (status === 200 || status === 409) {
      summary.sent += 1;
      if (!state.shared.includes(item.proofHash)) state.shared.push(item.proofHash);
    } else if (status === 410 || status === 400 || status === 403 || status === 413) {
      // 403: this proof was first synced without a token (an older app), so it can never take evidence.
      summary.dropped += 1;
    } else {
      summary.kept += 1;
      keep.push(item);
    }
  }
  state.outbox = keep;
  await writeState(state);
  return summary;
}

/**
 * Ask the api which of these proofs a coordinator requested photos for, and remember the ones the
 * reporter has not answered yet. Returns the pending list. Never throws.
 */
export async function checkEvidenceRequests(
  apiUrl: string,
  proofHashes: string[],
  fetchImpl: typeof fetch,
): Promise<string[]> {
  const state = await readState();
  const answered = new Set([...state.shared, ...state.declined, ...state.outbox.map((o) => o.proofHash)]);
  const ask = [...new Set(proofHashes)].filter((h) => !answered.has(h)).slice(0, MAX_REQUEST_CHECK);
  if (ask.length === 0) return state.requests;
  try {
    // Each hash travels with its token; the api only reveals requests to the device that holds it.
    const proofs: { proofHash: string; token: string }[] = [];
    for (const proofHash of ask) {
      const token = await evidenceTokenFor(proofHash);
      if (token) proofs.push({ proofHash, token });
    }
    if (proofs.length === 0) return state.requests;
    const res = await fetchImpl(`${apiUrl.replace(/\/+$/, "")}/evidence-requests`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ proofs }),
    });
    if (!res.ok) return state.requests;
    const data = (await res.json()) as { requested?: unknown };
    const found = strings(data.requested).filter((h) => ask.includes(h));
    // Replace the answers for the hashes we asked about; keep any others as they were.
    state.requests = [...state.requests.filter((h) => !ask.includes(h)), ...found];
    await writeState(state);
    return state.requests;
  } catch {
    return state.requests;
  }
}

/** Coordinator requests still waiting for the reporter. Never throws. */
export async function pendingEvidenceRequests(): Promise<string[]> {
  return (await readState()).requests;
}

export type ApproveResult = { ok: true; queued: number; missing: number } | { ok: false; reason: "unavailable" };

/**
 * The reporter said yes. Each photo is read from this phone, checked against its proofHash, sealed,
 * queued and flushed. A photo no longer on the phone is counted as missing and not retried.
 */
export async function approveEvidenceRequest(
  proofs: { proofHash: string; readPhoto: () => Promise<Uint8Array | null> }[],
  apiUrl: string,
  fetchImpl: typeof fetch,
  pubKey: string = programmePubKey(),
): Promise<ApproveResult> {
  if (!evidenceSharingAvailable(pubKey)) return { ok: false, reason: "unavailable" };
  const state = await readState();
  let queued = 0;
  let missing = 0;
  for (const p of proofs) {
    let bytes: Uint8Array | null = null;
    try {
      bytes = await p.readPhoto();
    } catch {
      bytes = null;
    }
    let cipher: string | null = null;
    if (bytes) {
      try {
        cipher = sealPhotoForProof(pubKey, p.proofHash, bytes);
      } catch {
        cipher = null;
      }
    }
    if (cipher) {
      if (!state.outbox.some((o) => o.proofHash === p.proofHash)) {
        state.outbox.push({ proofHash: p.proofHash, cipher, queuedAt: Date.now() });
      }
      queued += 1;
    } else {
      missing += 1;
    }
    state.requests = state.requests.filter((h) => h !== p.proofHash);
  }
  await writeState(state);
  await flushEvidenceOutbox(apiUrl, fetchImpl);
  return { ok: true, queued, missing };
}

/** The reporter said no. Remembered on this phone only, so the prompt does not come back. */
export async function declineEvidenceRequest(proofHashes: string[]): Promise<void> {
  const state = await readState();
  state.requests = state.requests.filter((h) => !proofHashes.includes(h));
  for (const h of proofHashes) if (!state.declined.includes(h)) state.declined.push(h);
  await writeState(state);
}

/**
 * One evidence pass after the proof sync: send queued ciphertext, then look for new coordinator
 * requests on proofs the api already has. Never throws.
 */
export async function syncEvidence(
  apiUrl: string,
  fetchImpl: typeof fetch,
  syncedProofHashes: string[],
): Promise<void> {
  try {
    await flushEvidenceOutbox(apiUrl, fetchImpl);
    await checkEvidenceRequests(apiUrl, syncedProofHashes, fetchImpl);
  } catch {
    // Best-effort: evidence never affects the proof sync.
  }
}

/** Read a queued photo's bytes from this phone. null when it is gone. Never throws. */
export async function readLocalPhoto(uri: string): Promise<Uint8Array | null> {
  try {
    const { File } = await import("expo-file-system");
    const f = new File(uri);
    return f.exists ? await f.bytes() : null;
  } catch {
    return null;
  }
}
