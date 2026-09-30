// zk-bench.tsx: hidden device benchmark for the on-device Semaphore prover. Reachable only by the
// deep link prufture://zk-bench; linked from nowhere in the app. Uses throwaway test identities
// (src/zk-bench-fixture.ts), sends nothing anywhere, and only measures time and correctness.

import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Identity } from "@semaphore-protocol/identity";
import { proveOnDevice, verifyOnDevice, zkProverAvailable } from "../modules/prufture-zk";
import { BackLink, Notice, PrimaryButton, Screen, ScreenTitle } from "../src/components/ui";
import { buildCircuitInputs } from "../src/personhood-inputs";
import {
  BENCH_COMMITMENTS,
  BENCH_EXPECTED_NULLIFIER,
  BENCH_MESSAGE,
  BENCH_PRIVATE_KEY,
  BENCH_ROOT,
  BENCH_SCOPE,
} from "../src/zk-bench-fixture";
import { color, radius, space, type } from "../src/theme";

interface BenchResult {
  inputsMs: number;
  coldMs: number;
  warmMs: number[];
  verifyMs: number;
  verified: boolean;
  rootMatches: boolean;
  nullifierMatches: boolean;
}

async function runBench(): Promise<BenchResult> {
  let t = Date.now();
  const id = new Identity(BENCH_PRIVATE_KEY);
  const { inputs, root } = buildCircuitInputs({
    secretScalar: id.secretScalar,
    commitment: id.commitment,
    commitments: BENCH_COMMITMENTS,
    message: BigInt(BENCH_MESSAGE),
    scope: BigInt(BENCH_SCOPE),
  });
  const inputsMs = Date.now() - t;

  t = Date.now();
  const first = await proveOnDevice(inputs);
  const coldMs = Date.now() - t;

  const warmMs: number[] = [];
  for (let i = 0; i < 3; i += 1) {
    t = Date.now();
    await proveOnDevice(inputs);
    warmMs.push(Date.now() - t);
  }

  t = Date.now();
  const verified = await verifyOnDevice(first);
  const verifyMs = Date.now() - t;

  return {
    inputsMs,
    coldMs,
    warmMs,
    verifyMs,
    verified,
    rootMatches: root === BENCH_ROOT && first.publicSignals[0] === BENCH_ROOT,
    nullifierMatches: first.publicSignals[1] === BENCH_EXPECTED_NULLIFIER,
  };
}

export default function ZkBenchScreen() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<BenchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const available = zkProverAvailable();

  const onRun = async () => {
    setBusy(true);
    setError(null);
    try {
      setResult(await runBench());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const pass = result && result.verified && result.rootMatches && result.nullifierMatches;
  const rows: [string, string][] = result
    ? [
        ["Inputs (JS)", `${result.inputsMs} ms`],
        ["Proof, first run", `${result.coldMs} ms`],
        ["Proof, next 3 runs", result.warmMs.map((m) => `${m} ms`).join(" · ")],
        ["Check on device", `${result.verifyMs} ms · ${result.verified ? "valid" : "INVALID"}`],
        ["Group matches", result.rootMatches ? "yes" : "NO"],
        ["Same result as reference", result.nullifierMatches ? "yes" : "NO"],
      ]
    : [];

  return (
    <Screen>
      <BackLink label="Back" onPress={() => router.back()} />
      <ScreenTitle hint="Test identities only. Nothing is sent.">Prover benchmark</ScreenTitle>
      {!available ? (
        <Notice tone="info">The on-device prover is not part of this build.</Notice>
      ) : (
        <PrimaryButton label={busy ? "Running…" : "Run benchmark"} busy={busy} onPress={onRun} />
      )}
      {error ? (
        <Notice tone="attention" role="alert">
          {error}
        </Notice>
      ) : null}
      {result ? (
        <View style={styles.card} accessibilityLiveRegion="polite">
          <Text style={styles.verdict}>{pass ? "PASS" : "FAIL"}</Text>
          {rows.map(([label, value]) => (
            <View key={label} style={styles.row} accessible accessibilityLabel={`${label}: ${value}`}>
              <Text style={styles.label}>{label}</Text>
              <Text style={styles.value}>{value}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.sm, padding: space.md, borderRadius: radius.md, backgroundColor: color.surfaceSoft },
  verdict: { ...type.body, color: color.text, fontWeight: "700" },
  row: { gap: space.xs },
  label: { ...type.meta, color: color.muted, fontWeight: "700" },
  value: { ...type.body, color: color.text },
});
