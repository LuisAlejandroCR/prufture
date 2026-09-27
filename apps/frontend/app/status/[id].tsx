// status/[id].tsx: the lifecycle of one report in plain language — a four-stage timeline over all its
// per-photo proofs (grouped by the local reportId), marking a stage done only when every proof reached
// it. Proof references sit under Technical details. No PII, exact location or secrets.

import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Linking, LayoutAnimation, Pressable, StyleSheet, Text, View } from "react-native";
import { Icon } from "../../src/components/icons/Icon";
import { BackLink, Notice, Screen, SecondaryButton, StatusPill } from "../../src/components/ui";
import { listProofs } from "../../src/queue";
import type { LocalProof } from "../../src/queue-row";
import { getTask } from "../../src/tasks";
import { runPendingSync } from "../../src/useAutoSync";
import { color, friendlyStatus, radius, space, type } from "../../src/theme";

const VERIFY_BASE = process.env.EXPO_PUBLIC_VERIFY_URL ?? "https://prufture.example/verify";

type Stage = { label: string; done: boolean; current: boolean };

/** Resolve the id param to a report: all rows sharing a reportId, or one row by id. */
export function resolveReport(rows: LocalProof[], id: string): LocalProof[] {
  const byReport = rows.filter((r) => r.reportId && r.reportId === id);
  if (byReport.length > 0) return byReport;
  const one = rows.find((r) => r.id === id);
  if (!one) return [];
  // A row id was passed (e.g. from the sending flow): expand to its whole report.
  return one.reportId ? rows.filter((r) => r.reportId === one.reportId) : [one];
}

/** Combined stages: a stage is done only once every proof in the report reached it. */
export function groupStages(group: LocalProof[]): Stage[] {
  const synced = group.every((r) => r.status === "synced" || r.status === "attested");
  const confirmed = group.every((r) => r.status === "attested" || r.attestationCount > 0);
  return [
    { label: "Saved on this phone", done: true, current: false },
    { label: "Sent to the programme", done: synced, current: !synced },
    { label: "Reviewed", done: confirmed, current: synced && !confirmed },
    { label: "Confirmed", done: confirmed, current: false },
  ];
}

export default function ReportStatusScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [group, setGroup] = useState<LocalProof[]>([]);
  const [showTech, setShowTech] = useState(false);
  const [checking, setChecking] = useState(false);

  const load = useCallback(() => {
    listProofs()
      .then((rows) => setGroup(resolveReport(rows, id ?? "")))
      .catch(() => setGroup([]));
  }, [id]);

  useFocusEffect(useCallback(() => load(), [load]));

  const checkNow = () => {
    setChecking(true);
    runPendingSync()
      .then(() => load())
      .catch(() => undefined)
      .finally(() => setChecking(false));
  };

  if (group.length === 0) {
    return (
      <Screen>
        <BackLink label="Updates" onPress={() => router.back()} />
        <Text style={styles.body}>This report could not be found.</Text>
      </Screen>
    );
  }

  const newest = group[0];
  if (!newest) return null;
  const task = getTask(newest.taskId);
  const anyPending = group.some((r) => r.status === "pending_sync");
  const minCount = Math.min(...group.map((r) => r.attestationCount));
  const status = anyPending
    ? friendlyStatus("pending_sync")
    : friendlyStatus(
        group.every((r) => r.status === "attested") ? "attested" : "synced",
        minCount,
      );
  const stages = groupStages(group);
  const photos = group.length;

  return (
    <Screen>
      <BackLink label="Updates" onPress={() => router.back()} />
      <Text style={styles.title} accessibilityRole="header">
        {task.title}
      </Text>
      <View style={styles.metaRow}>
        <Icon name="location" size={15} color={color.faint} />
        <Text style={styles.meta}>{task.area}</Text>
      </View>
      <StatusPill status={status} count={minCount} />

      {anyPending ? (
        <Notice tone="info" icon="offline">
          This report is ready to send. It will go out automatically when you have signal.
        </Notice>
      ) : null}

      <View style={styles.timeline}>
        {stages.map((s, i, arr) => (
          <View key={s.label} style={styles.stageRow}>
            <View style={styles.stageMarker}>
              <View style={[styles.node, s.done && styles.nodeDone, s.current && styles.nodeCurrent]}>
                {s.done ? <Icon name="check" size={12} color={color.onPrimary} /> : null}
              </View>
              {i < arr.length - 1 ? (
                <View style={[styles.connector, s.done && styles.connectorDone]} />
              ) : null}
            </View>
            <Text style={[styles.stageLabel, !s.done && !s.current && styles.stageUpcoming]}>
              {s.label}
            </Text>
          </View>
        ))}
      </View>

      {!anyPending ? (
        <SecondaryButton label="Check for updates" icon="retry" onPress={checkNow} disabled={checking} />
      ) : null}

      <Pressable
        onPress={() => {
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          setShowTech((v) => !v);
        }}
        accessibilityRole="button"
        accessibilityState={{ expanded: showTech }}
        accessibilityLabel="Technical details"
        style={({ pressed }) => [styles.techToggle, pressed && styles.pressed]}
      >
        <Icon name="more" size={16} color={color.muted} />
        <Text style={styles.techToggleText}>Technical details</Text>
        <Icon name={showTech ? "back" : "chevron"} size={14} color={color.faint} />
      </Pressable>

      {showTech ? (
        <View style={styles.tech}>
          <TechRow label="Photos in this report" value={String(photos)} />
          <TechRow label="Captured on" value={new Date(newest.capturedAt).toLocaleString()} />
          <TechRow
            label="Approximate area"
            value={newest.geohash ? newest.geohash.slice(0, 5) : "not added"}
            mono
          />
          <TechRow label="Confirmations" value={String(minCount)} />

          <Text style={styles.refLabel}>References</Text>
          {group.map((r) => (
            <Pressable
              key={r.id}
              onPress={() => Linking.openURL(`${VERIFY_BASE}/${r.proofHash}`).catch(() => undefined)}
              accessibilityRole="link"
              accessibilityLabel={`Open the public status page for photo reference ${r.proofHash.slice(0, 8)}`}
              style={styles.refRow}
            >
              <Icon name="review" size={14} color={color.information} />
              <Text style={[styles.refValue, styles.mono]}>{r.proofHash.slice(0, 16)}...</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </Screen>
  );
}

function TechRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <View style={styles.techRow}>
      <Text style={styles.techLabel}>{label}</Text>
      <Text style={[styles.techValue, mono && styles.mono]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { ...type.display, color: color.text },
  metaRow: { flexDirection: "row", alignItems: "center", gap: space.xs },
  meta: { ...type.meta, color: color.muted },
  body: { ...type.body, color: color.muted },
  pressed: { opacity: 0.7 },
  timeline: { gap: 0, paddingVertical: space.sm },
  stageRow: { flexDirection: "row", gap: space.md, alignItems: "flex-start" },
  stageMarker: { alignItems: "center", width: 22 },
  node: {
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: color.border,
    backgroundColor: color.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  nodeDone: { backgroundColor: color.success, borderColor: color.success },
  nodeCurrent: { borderColor: color.primary },
  connector: { width: 2, height: 26, backgroundColor: color.border },
  connectorDone: { backgroundColor: color.success },
  stageLabel: { ...type.subtitle, color: color.text, paddingBottom: space.lg, flex: 1 },
  stageUpcoming: { color: color.faint },
  techToggle: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 44 },
  techToggleText: { ...type.subtitle, color: color.muted, flex: 1 },
  tech: { gap: space.sm, padding: space.md, borderRadius: radius.md, backgroundColor: color.surfaceSoft },
  techRow: { flexDirection: "row", justifyContent: "space-between", gap: space.md },
  techLabel: { ...type.meta, color: color.muted },
  techValue: { ...type.meta, color: color.text, flexShrink: 1, textAlign: "right" },
  mono: { fontFamily: "monospace" },
  refLabel: { ...type.meta, color: color.muted, fontWeight: "700", marginTop: space.xs },
  refRow: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 36 },
  refValue: { ...type.meta, color: color.information, fontWeight: "700" },
});
