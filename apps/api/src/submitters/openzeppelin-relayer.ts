// openzeppelin-relayer.ts: the second AttestationSubmitter adapter (provider portability plan,
// phase 2). Key custody moves out of this process into a self-hosted OpenZeppelin Relayer: this
// adapter hands it the already-allowlisted attest() calldata and the relayer signs and sends.
// No private key is read, derived or held here.
//
// OZ Relayer is asynchronous: POST /transactions queues a transaction and the hash appears once
// it is sent. So the adapter polls for the hash within a fixed budget, and remembers the queued
// transaction id per proof. A retry after the budget runs out re-polls that transaction instead
// of queueing a second one, so a slow relayer cannot make the programme pay for a proof twice.
// That memory is per process; the store's idempotency (attestOnce) covers everything anchored.
//
// Fail closed, in order: assertAllowed() over the built request; the relayer's own record must
// be an unpaused EVM relayer on the pinned network, reporting the pinned address; the queued
// transaction must come back from that address, to the EAS contract, with zero value. Errors
// name an HTTP status or a fixed reason — never the API key, the URL, or a vendor response body.

import { guard, type ExternalResult, type ProofPublicPayload } from "@proof/core";
import { encodeFunctionData, getAddress, isAddress } from "viem";
import { baseSepolia } from "viem/chains";
import { env } from "../env.js";
import { buildAttestRequest } from "../relayer-request.js";
import {
  assertAllowed,
  ATTEST_SELECTOR,
  sameAddress,
  type AttestResult,
  type AttestationSubmitter,
} from "../submitter.js";

/** Per-request budget, the same as every other provider call. */
export const OZ_TIMEOUT_MS = 5000;
/** How many times to ask for the hash of a queued transaction before giving up for now. */
export const OZ_POLL_ATTEMPTS = 5;
export const OZ_POLL_INTERVAL_MS = 1000;

/** Statuses after which a transaction will never get a usable hash. */
const TERMINAL = new Set(["failed", "canceled", "expired"]);

const TX_HASH = /^0x[0-9a-fA-F]{64}$/;

export interface OzRelayerDeps {
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  pollAttempts?: number;
  pollIntervalMs?: number;
}

interface OzTransaction {
  id?: unknown;
  hash?: unknown;
  status?: unknown;
  from?: unknown;
  to?: unknown;
  value?: unknown;
}

interface OzRelayer {
  address?: unknown;
  network?: unknown;
  network_type?: unknown;
  paused?: unknown;
  system_disabled?: unknown;
}

function isConfigured(): boolean {
  return Boolean(
    env.ozRelayerUrl &&
      env.ozRelayerId &&
      env.ozRelayerApiKey &&
      isAddress(env.ozRelayerAddress) &&
      env.easSchemaUid,
  );
}

function isZeroValue(v: unknown): boolean {
  return v === 0 || v === "0" || v === "0x0";
}

export function createOzRelayerSubmitter(deps: OzRelayerDeps = {}): AttestationSubmitter {
  const doFetch = deps.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const pollAttempts = deps.pollAttempts ?? OZ_POLL_ATTEMPTS;
  const pollIntervalMs = deps.pollIntervalMs ?? OZ_POLL_INTERVAL_MS;

  // `${relayerId}:${proofHash}` -> the OZ transaction id already queued for that proof.
  const queued = new Map<string, string>();

  /** One API call: explicit timeout, status-only errors, and the { success, data } envelope. */
  async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
    const base = env.ozRelayerUrl.replace(/\/+$/, "");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), OZ_TIMEOUT_MS);
    try {
      let res: Response;
      try {
        res = await doFetch(`${base}/api/v1/relayers/${encodeURIComponent(env.ozRelayerId)}${path}`, {
          method,
          headers: {
            authorization: `Bearer ${env.ozRelayerApiKey}`,
            ...(body === undefined ? {} : { "content-type": "application/json" }),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: controller.signal,
        });
      } catch {
        // The underlying error can carry the URL; report only that the relayer was unreachable.
        throw new Error("openzeppelin-relayer unreachable");
      }
      // Do not echo the body: it is vendor text, and on 4xx it may describe our credentials.
      if (!res.ok) throw new Error(`openzeppelin-relayer ${res.status}`);
      let envelope: { success?: unknown; data?: unknown };
      try {
        envelope = (await res.json()) as { success?: unknown; data?: unknown };
      } catch {
        throw new Error("openzeppelin-relayer returned a non-JSON response");
      }
      if (envelope?.success !== true || typeof envelope.data !== "object" || envelope.data === null) {
        throw new Error("openzeppelin-relayer reported failure");
      }
      return envelope.data as T;
    } finally {
      clearTimeout(timer);
    }
  }

  /** The relayer must be the one this deployment pinned, before anything is queued on it. */
  async function assertRelayerPinned(): Promise<void> {
    const r = await call<OzRelayer>("GET", "");
    if (r.network_type !== "evm") throw new Error("openzeppelin-relayer is not an EVM relayer");
    if (r.network !== env.ozRelayerNetwork) {
      throw new Error("openzeppelin-relayer is not bound to the allowlisted network");
    }
    if (r.paused === true || r.system_disabled === true) throw new Error("openzeppelin-relayer is paused");
    if (typeof r.address !== "string" || !sameAddress(r.address, env.ozRelayerAddress)) {
      throw new Error("openzeppelin-relayer address is not the pinned OZ_RELAYER_ADDRESS");
    }
  }

  /** A transaction the relayer reports must be exactly the call we allowlisted. */
  function assertTransactionMatches(tx: OzTransaction): void {
    if (typeof tx.from !== "string" || !sameAddress(tx.from, env.ozRelayerAddress)) {
      throw new Error("openzeppelin-relayer sent from an address other than the pinned one");
    }
    if (typeof tx.to !== "string" || !sameAddress(tx.to, env.easContract)) {
      throw new Error("openzeppelin-relayer transaction does not target the EAS contract");
    }
    if (!isZeroValue(tx.value)) throw new Error("openzeppelin-relayer transaction carries value");
  }

  /** Ask for the queued transaction until it has a hash, a terminal status, or the budget ends. */
  async function awaitHash(key: string, first: OzTransaction): Promise<string> {
    let tx = first;
    for (let attempt = 0; ; attempt++) {
      assertTransactionMatches(tx);
      if (typeof tx.hash === "string" && TX_HASH.test(tx.hash)) {
        queued.delete(key);
        return tx.hash;
      }
      if (typeof tx.status === "string" && TERMINAL.has(tx.status)) {
        // Nothing will be anchored for this transaction; let a later call queue a fresh one.
        queued.delete(key);
        throw new Error(`openzeppelin-relayer transaction ${tx.status}`);
      }
      if (attempt >= pollAttempts) {
        // Still queued. Keep the id so the next attempt picks this transaction up again.
        throw new Error("openzeppelin-relayer transaction queued, not yet sent");
      }
      await sleep(pollIntervalMs);
      tx = await call<OzTransaction>("GET", `/transactions/${encodeURIComponent(queued.get(key) ?? "")}`);
    }
  }

  return {
    name: "openzeppelin-relayer",
    configHint: "OZ_RELAYER_URL / OZ_RELAYER_ID / OZ_RELAYER_API_KEY / OZ_RELAYER_ADDRESS / EAS_SCHEMA_UID",

    isConfigured,

    // The pinned address, known without a network call; the relayer is refused if it differs.
    attester(): string | null {
      return isConfigured() ? getAddress(env.ozRelayerAddress) : null;
    },

    async submit(payload: ProofPublicPayload): Promise<ExternalResult<AttestResult>> {
      return guard("relayer/eas", async () => {
        if (!isConfigured()) throw new Error("openzeppelin-relayer not configured");

        const request = buildAttestRequest(payload);
        // Policy first: nothing is sent to the relayer unless the call is allowlisted.
        assertAllowed({ ...request, chainId: baseSepolia.id });
        const data = encodeFunctionData(request);
        if (!data.startsWith(ATTEST_SELECTOR)) throw new Error("submitter: calldata is not attest()");

        await assertRelayerPinned();

        const key = `${env.ozRelayerId}:${payload.proofHash}`;
        let tx: OzTransaction;
        const existing = queued.get(key);
        if (existing) {
          tx = await call<OzTransaction>("GET", `/transactions/${encodeURIComponent(existing)}`);
        } else {
          tx = await call<OzTransaction>("POST", "/transactions", {
            to: env.easContract,
            data,
            value: 0,
            speed: "average",
          });
          if (typeof tx.id !== "string" || tx.id.length === 0 || tx.id.length > 128) {
            throw new Error("openzeppelin-relayer returned no transaction id");
          }
          queued.set(key, tx.id);
        }

        const txHash = await awaitHash(key, tx);
        // Checksummed, so the store's per-attester dedupe sees one spelling of this address.
        return { txHash, attester: getAddress(env.ozRelayerAddress) };
      });
    },
  };
}

export const ozRelayerSubmitter = createOzRelayerSubmitter();
