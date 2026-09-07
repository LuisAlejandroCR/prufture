// status/[id].tsx: the lifecycle of one report in plain language. A four-stage
// timeline where only completed stages are marked done. Technical details sit in a
// collapsed section for demo or expert users and still carry no PII, no exact
// location, no secrets. Presentation over src/queue + src/tasks.

import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Linking, LayoutAnimation, Pressable, StyleSheet, Text, View } from "react-native";
import type { QueuedProof } from "@proof/core";
import { Icon } from "../../src/components/icons/Icon";
import { BackLink, Notice, Screen, SecondaryButton, StatusPill } from "../../src/components/ui";
import { listProofs } from "../../src/queue";
import { getTask } from "../../src/tasks";
import { runPendingSync } from "../../src/useAutoSync";
import { color, friendlyStatus, radius, space, type } from "../../src/theme";

const VERIFY_BASE = process.env.EXPO_PUBLIC_VERIFY_URL ?? "https://prufture.example/verify";

type Stage = { label: string; done: boolean; current: boolean };

function stages(row: QueuedProof): Stage[] {
  const synced = row.status === "synced" || row.status === "attested";
  const confirmed = row.status === "attested" || row.attestationCount > 0;
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
  const [row, setRow] = useState<QueuedProof | null>(null);
  const [showTech, setShowTech] = useState(false);
  const [checking, setChecking] = useState(false);

  const load = useCallback(() => {
    listProofs()
      .then((rows) => setRow(rows.find((r) => r.id === id) ?? null))
      .catch(() => setRow(null));
  }, [id]);

  useFocusEffect(useCallback(() => load(), [load]));

  const checkNow = () => {
    setChecking(true);
    runPendingSync()
      .then(() => load())
      .catch(() => undefined)
      .finally(() => setChecking(false));
  };

  if (!row) {
    return (
      <Screen>
        <BackLink label="Updates" onPress={() => router.back()} />
        <Text style={styles.body}>This report could not be found.</Text>
      </Screen>
    );
  }

  const task = getTask(row.taskId);
  const status = friendlyStatus(row.status, row.attestationCount);
  const verifyUrl = `${VERIFY_BASE}/${row.proofHash}`;

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
      <StatusPill status={status} count={row.attestationCount} />

      {row.status === "pending_sync" ? (
        <Notice tone="info" icon="offline">
          This report is ready to send. It will go out automatically when you have signal.
        </Notice>
      ) : null}

      <View style={styles.timeline}>
        {stages(row).map((s, i, arr) => (
          <View key={s.label} style={styles.stageRow}>
            <View style={styles.stageMarker}>
              <View
                style={[
                  styles.node,
                  s.done && styles.nodeDone,
                  s.current && styles.nodeCurrent,
                ]}
              >
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

      {row.status !== "pending_sync" ? (
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
          <TechRow label="Public reference" value={`${row.proofHash.slice(0, 16)}...`} mono />
          <TechRow label="Captured on" value={new Date(row.capturedAt).toLocaleString()} />
          <TechRow label="Approximate area" value={row.geohash ? row.geohash.slice(0, 5) : "not added"} mono />
          <TechRow label="Confirmations" value={String(row.attestationCount)} />
          <Pressable
            onPress={() => Linking.openURL(verifyUrl).catch(() => undefined)}
            accessibilityRole="link"
            accessibilityLabel="Open the public report status page"
            style={styles.link}
          >
            <Icon name="review" size={15} color={color.information} />
            <Text style={styles.linkText}>Open public report status</Text>
          </Pressable>
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
  techToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    minHeight: 44,
  },
  techToggleText: { ...type.subtitle, color: color.muted, flex: 1 },
  tech: {
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: color.surfaceSoft,
  },
  techRow: { flexDirection: "row", justifyContent: "space-between", gap: space.md },
  techLabel: { ...type.meta, color: color.muted },
  techValue: { ...type.meta, color: color.text, flexShrink: 1, textAlign: "right" },
  mono: { fontFamily: "monospace" },
  link: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 44 },
  linkText: { ...type.meta, color: color.information, fontWeight: "700" },
});
