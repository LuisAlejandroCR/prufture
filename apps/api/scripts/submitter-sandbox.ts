// submitter-sandbox.ts: phase 2 exit check for a submitter adapter against a real sandbox — one real
// attestation read back from EAS, duplicates that send nothing, denials that fail closed (in the adapter
// and in the relayer's own policy), and provider loss that degrades typed. Synthetic proofs only.
//
//   npm run submitter-sandbox --workspace apps/api -- [local-key|openzeppelin-relayer]

import { createPublicClient, parseEventLogs, type Hex } from "viem";
import { baseSepolia } from "viem/chains";
import { env } from "../src/env.js";
import { attestOnce, selectedSubmitter } from "../src/relayer.js";
import { endpointLabel, rpcTransport } from "../src/rpc.js";
import { EAS_GET_ATTESTATION_ABI, type CheckResult } from "../src/rpc-check.js";
import { syntheticPayload } from "../src/cutover.js";
import { publicError, sameAddress, type AttestationSubmitter } from "../src/submitter.js";
import { localKeySubmitter } from "../src/submitters/local-key.js";
import { ozRelayerSubmitter } from "../src/submitters/openzeppelin-relayer.js";

const ADAPTERS: Record<string, AttestationSubmitter> = {
  "local-key": localKeySubmitter,
  "openzeppelin-relayer": ozRelayerSubmitter,
};

const ATTESTED_EVENT = [
  {
    type: "event",
    name: "Attested",
    inputs: [
      { name: "recipient", type: "address", indexed: true },
      { name: "attester", type: "address", indexed: true },
      { name: "uid", type: "bytes32", indexed: false },
      { name: "schemaUID", type: "bytes32", indexed: true },
    ],
  },
] as const;

const client = () => createPublicClient({ chain: baseSepolia, transport: rpcTransport() });

async function run(name: string, op: () => Promise<string>): Promise<CheckResult> {
  const started = Date.now();
  try {
    return { name, ok: true, required: true, detail: await op(), ms: Date.now() - started };
  } catch (e) {
    return { name, ok: false, required: true, detail: publicError(e), ms: Date.now() - started };
  }
}

/** Runs op with some env overridden, restoring every value afterwards. */
async function withEnv<T>(overrides: Record<string, string>, op: () => Promise<T>): Promise<T> {
  const saved = Object.fromEntries(Object.keys(overrides).map((k) => [k, process.env[k]]));
  Object.assign(process.env, overrides);
  try {
    return await op();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

/** A call straight to the OZ Relayer API, bypassing the adapter: what a leaked API key could do. */
async function ozDirect(body: unknown): Promise<{ status: number; success: boolean; id?: string }> {
  const res = await fetch(
    `${env.ozRelayerUrl.replace(/\/+$/, "")}/api/v1/relayers/${encodeURIComponent(env.ozRelayerId)}/transactions`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${env.ozRelayerApiKey}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    },
  );
  const j = (await res.json().catch(() => ({}))) as { success?: unknown; data?: { id?: unknown } };
  return { status: res.status, success: j.success === true, id: typeof j.data?.id === "string" ? j.data.id : undefined };
}

async function nonceOf(address: string): Promise<number> {
  return client().getTransactionCount({ address: address as Hex, blockTag: "pending" });
}

async function main(): Promise<void> {
  const name = process.argv[2] ?? selectedSubmitter().name;
  const submitter = ADAPTERS[name];
  if (!submitter) {
    console.error(`unknown adapter "${name}". known: ${Object.keys(ADAPTERS).join(", ")}`);
    process.exit(2);
  }
  if (!submitter.isConfigured() || env.rpcUrls.length === 0) {
    console.error(`${name} is not configured (${submitter.configHint ?? "see .env.example"}; RPC_URL for reads)`);
    process.exit(2);
  }
  const attester = submitter.attester?.() ?? "";
  if (!attester) {
    console.error(`${name} cannot name its attester address; check its key or pinned address`);
    process.exit(2);
  }
  console.log(`adapter ${name}, attester ${attester}, reads via ${endpointLabel(env.rpcUrls[0]!)}\n`);

  const payload = syntheticPayload(Date.now(), new Date().toISOString());
  let txHash = "";

  const checks: CheckResult[] = [];

  checks.push(
    await run("real-attestation", async () => {
      const r = await submitter.submit(payload);
      if (!r.available) throw new Error(`submit unavailable: ${r.error}`);
      txHash = r.data.txHash;
      const receipt = await client().waitForTransactionReceipt({ hash: txHash as Hex, timeout: 60_000 });
      if (receipt.status !== "success") throw new Error("transaction reverted");
      const [log] = parseEventLogs({ abi: ATTESTED_EVENT, logs: receipt.logs, eventName: "Attested" });
      if (!log) throw new Error("no Attested event");
      const a = await client().readContract({
        address: env.easContract as Hex,
        abi: EAS_GET_ATTESTATION_ABI,
        functionName: "getAttestation",
        args: [log.args.uid],
      });
      if (!sameAddress(a.attester, attester)) throw new Error("attester is not the adapter's pinned address");
      if (a.schema.toLowerCase() !== env.easSchemaUid.toLowerCase()) throw new Error("schema is not the allowlisted one");
      const expected = (await import("../src/relayer-request.js")).encodeProofData(payload);
      if (a.data !== expected) throw new Error("on-chain data is not exactly the four public fields");
      return `uid ${log.args.uid.slice(0, 18)}…, block ${receipt.blockNumber}`;
    }),
  );

  checks.push(
    await run("duplicate-sends-nothing", async () => {
      const before = await nonceOf(attester);
      const r = await attestOnce(payload, [{ attester, txHash }], submitter);
      const after = await nonceOf(attester);
      if (!r.available || r.data.txHash !== txHash) throw new Error("the stored record was not reused");
      if (after !== before) throw new Error(`nonce moved ${before} -> ${after}`);
      return `same tx, nonce stayed ${before}`;
    }),
  );

  if (name === "openzeppelin-relayer") {
    checks.push(
      await run("wrong-pinned-address-fails-closed", async () => {
        const before = await nonceOf(attester);
        const r = await withEnv({ OZ_RELAYER_ADDRESS: "0x000000000000000000000000000000000000dEaD" }, () =>
          submitter.submit(syntheticPayload(Date.now() + 2)),
        );
        const after = await nonceOf(attester);
        if (r.available) throw new Error("sent through a relayer whose signer is not the pinned one");
        if (after !== before) throw new Error("a transaction was sent anyway");
        return r.error ?? "refused";
      }),
    );

    checks.push(
      await run("relayer-refuses-other-receiver", async () => {
        const before = await nonceOf(attester);
        const r = await ozDirect({ to: "0x000000000000000000000000000000000000dEaD", data: "0x", value: 0 });
        const after = await nonceOf(attester);
        if (r.success) throw new Error("the relayer queued a transaction to a non-EAS address");
        if (after !== before) throw new Error("a transaction was sent anyway");
        return `HTTP ${r.status}, nothing sent`;
      }),
    );

    checks.push(
      await run("value-cannot-move-funds", async () => {
        const eas = env.easContract as Hex;
        const before = await client().getBalance({ address: eas });
        const { encodeFunctionData } = await import("viem");
        const { buildAttestRequest } = await import("../src/relayer-request.js");
        const data = encodeFunctionData(buildAttestRequest(syntheticPayload(Date.now() + 4)));
        const r = await ozDirect({ to: eas, data, value: 1 });
        if (!r.success || !r.id) return `HTTP ${r.status}, refused by the relayer`;
        // Queued: EAS must revert it (the schema has no resolver, so attest() is not payable).
        for (let i = 0; i < 20; i++) {
          await new Promise((res) => setTimeout(res, 1000));
          const tx = await fetch(
            `${env.ozRelayerUrl.replace(/\/+$/, "")}/api/v1/relayers/${encodeURIComponent(env.ozRelayerId)}/transactions/${r.id}`,
            { headers: { authorization: `Bearer ${env.ozRelayerApiKey}` } },
          ).then((x) => x.json() as Promise<{ data?: { hash?: string; status?: string } }>);
          if (tx.data?.status === "failed" || tx.data?.status === "canceled") break;
          if (tx.data?.hash) {
            const receipt = await client().waitForTransactionReceipt({ hash: tx.data.hash as Hex, timeout: 30_000 });
            if (receipt.status === "success") throw new Error("a value-carrying attest() succeeded");
            break;
          }
        }
        const after = await client().getBalance({ address: eas });
        if (after !== before) throw new Error(`EAS balance moved ${before} -> ${after}`);
        return "reverted on chain; EAS balance unchanged";
      }),
    );
  }

  checks.push(
    await run("provider-loss-is-typed", async () => {
      const dead: Record<string, string> =
        name === "openzeppelin-relayer"
          ? { OZ_RELAYER_URL: "http://127.0.0.1:9" }
          : { RPC_URL: "http://127.0.0.1:9", RPC_FALLBACK_URLS: "" };
      const r = await withEnv(dead, () => submitter.submit(syntheticPayload(Date.now() + 3)));
      if (r.available) throw new Error("a dead provider reported success");
      const leaked = [env.ozRelayerApiKey, env.relayerPrivateKey].filter((s) => s && JSON.stringify(r).includes(s));
      if (leaked.length > 0) throw new Error("key material in the result");
      if (/https?:\/\//.test(r.error ?? "")) throw new Error("an endpoint URL in the result");
      return r.error ?? "unavailable";
    }),
  );

  for (const c of checks) {
    console.log(`  ${c.ok ? "ok  " : "FAIL"} ${c.name.padEnd(34)} ${String(c.ms).padStart(6)}ms  ${c.detail}`);
  }
  const passed = checks.every((c) => c.ok);
  console.log(`\nphase 2 sandbox ${passed ? "PASSED" : "FAILED"} for ${name}`);
  process.exit(passed ? 0 : 1);
}

void main();
