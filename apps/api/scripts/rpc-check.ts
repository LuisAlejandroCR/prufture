// rpc-check.ts: phase 1 exit check — runs the rpc-check suite on every endpoint, checks they agree,
// then drills failover against a local hung endpoint and a refused port. Exits non-zero unless two
// or more endpoints pass. --attest also sends one synthetic attestation through each (funded key).
//
//   npm run rpc-check --workspace apps/api -- [--attest] [endpoint ...]   (default: env.rpcUrls)

import { createServer, type Server } from "node:net";
import { createPublicClient, http, type Hex } from "viem";
import { baseSepolia } from "viem/chains";
import { env, relayerConfigured } from "../src/env.js";
import { syntheticPayload } from "../src/cutover.js";
import { endpointLabel } from "../src/rpc.js";
import {
  CHECK_TIMEOUT_MS,
  checkEndpoint,
  endpointsAgree,
  failoverDrill,
  type CheckResult,
  type EndpointReport,
} from "../src/rpc-check.js";
import { localKeySubmitter } from "../src/submitters/local-key.js";

function listen(server: Server): Promise<number> {
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve((server.address() as { port: number }).port)));
}

/** Accepts connections and never answers: the case a timeout exists for. */
async function hungEndpoint(): Promise<{ url: string; close: () => void }> {
  const sockets = new Set<import("node:net").Socket>();
  const server = createServer((s) => sockets.add(s));
  const port = await listen(server);
  return { url: `http://127.0.0.1:${port}`, close: () => { sockets.forEach((s) => s.destroy()); server.close(); } };
}

async function refusedEndpoint(): Promise<string> {
  const server = createServer();
  const port = await listen(server);
  await new Promise((r) => server.close(r));
  return `http://127.0.0.1:${port}`;
}

function print(label: string, c: CheckResult): void {
  const mark = c.ok ? "ok  " : c.required ? "FAIL" : "warn";
  console.log(`  ${mark} ${c.name.padEnd(18)} ${String(c.ms).padStart(5)}ms  ${label}${c.detail}`);
}

/** One real attest() of a synthetic proof through exactly this endpoint, then its receipt. */
async function attestThrough(url: string): Promise<CheckResult> {
  const started = Date.now();
  const saved = { primary: process.env.RPC_URL, fallbacks: process.env.RPC_FALLBACK_URLS };
  process.env.RPC_URL = url;
  process.env.RPC_FALLBACK_URLS = "";
  try {
    const r = await localKeySubmitter.submit(syntheticPayload(Date.now(), new Date().toISOString()));
    if (!r.available) return { name: "attest", ok: false, required: true, detail: "submit unavailable", ms: Date.now() - started };
    const client = createPublicClient({ chain: baseSepolia, transport: http(url, { timeout: CHECK_TIMEOUT_MS }) });
    const receipt = await client.waitForTransactionReceipt({ hash: r.data.txHash as Hex, timeout: 60_000 });
    return { name: "attest", ok: receipt.status === "success", required: true, detail: r.data.txHash, ms: Date.now() - started };
  } catch (e) {
    return { name: "attest", ok: false, required: true, detail: e instanceof Error ? e.name : "Error", ms: Date.now() - started };
  } finally {
    process.env.RPC_URL = saved.primary ?? "";
    process.env.RPC_FALLBACK_URLS = saved.fallbacks ?? "";
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const attest = args.includes("--attest");
  const urls = args.filter((a) => !a.startsWith("--"));
  const endpoints = urls.length > 0 ? urls : env.rpcUrls;

  if (endpoints.length === 0) {
    console.error("no endpoints: pass them as arguments or set RPC_URL / RPC_FALLBACK_URLS");
    process.exit(2);
  }
  if (attest && !relayerConfigured()) {
    console.error("--attest needs RELAYER_PRIVATE_KEY and EAS_SCHEMA_UID");
    process.exit(2);
  }

  const reports: EndpointReport[] = [];
  for (const url of endpoints) {
    const report = await checkEndpoint(url);
    if (attest) report.checks.push(await attestThrough(url));
    report.passed = report.checks.every((c) => c.ok || !c.required);
    reports.push(report);
    console.log(`${report.passed ? "PASS" : "FAIL"} ${report.endpoint}`);
    for (const c of report.checks) print("", c);
  }

  const agree = endpointsAgree(reports);
  console.log(`\nendpoints agree on the live attestation: ${agree}`);

  const hung = await hungEndpoint();
  const refused = await refusedEndpoint();
  const live = endpoints.find((_, i) => reports[i]?.passed);
  let drill: CheckResult[] = [];
  if (live) {
    console.log(`\nfailover drill (dead: hung + refused, live: ${endpointLabel(live)})`);
    drill = await failoverDrill(
      http(live, { timeout: CHECK_TIMEOUT_MS, retryCount: 0 }),
      [http(hung.url, { timeout: CHECK_TIMEOUT_MS, retryCount: 0 }), http(refused, { timeout: CHECK_TIMEOUT_MS, retryCount: 0 })],
    );
    for (const c of drill) print("", c);
  }
  hung.close();

  const passing = reports.filter((r) => r.passed).length;
  const ready = passing >= 2 && agree && drill.length > 0 && drill.every((c) => c.ok);
  console.log(
    `\nphase 1 ${ready ? "PASSED" : "HELD"}: ${passing}/${reports.length} endpoints passed` +
      (passing < 2 ? " (the exit criterion needs two)" : ""),
  );
  process.exit(ready ? 0 : 1);
}

void main();
