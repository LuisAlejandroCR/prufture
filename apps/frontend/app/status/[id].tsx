// status/[id].tsx: the lifecycle of one report in plain language — a four-stage timeline with short
// descriptions over all its per-photo proofs (src/progress.ts; id may be a reportId, row id or
// proofHash), marking a stage done only when every proof reached it. For an assignment it shows live
// community confirmations from independent nearby reports (src/confirmations.ts). The reporter's
// private note (local only) shows under the timeline. Proof references sit under Technical details.
// No PII, exact location or secrets.

import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { LayoutAnimation, Pressable, StyleSheet, Text, View } from "react-native";
import { Icon } from "../../src/components/icons/Icon";
import { BackLink, Notice, Screen, SecondaryButton, StatusPill, TaskHeader } from "../../src/components/ui";
import { announce, stageSpoken, syncResult } from "../../src/announce";
import {
  confirmationsLabel,
  confirmationsNote,
  fetchConfirmations,
  liveConfirmations,
  type ConfirmationReport,
} from "../../src/confirmations";
import { identityStepEnabled } from "../../src/flags";
import { listProofs } from "../../src/queue";
import type { LocalProof } from "../../src/queue-row";
import { openInApp, publicRecordUrl } from "../../src/links";
import { findReport, reportStages } from "../../src/progress";
import { getLocalNote } from "../../src/report-note";
import { getTask } from "../../src/tasks";
import { API_URL, runPendingSync } from "../../src/useAutoSync";
import { color, friendlyStatus, radius, space, type } from "../../src/theme";


export default function ReportStatusScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [group, setGroup] = useState<LocalProof[]>([]);
  const [showTech, setShowTech] = useState(false);
  const [checking, setChecking] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  // null = not checked (offline, unsent or api unreachable): no count is shown rather than a guess.
  const [reports, setReports] = useState<ConfirmationReport[] | null>(null);

  const load = useCallback(() => {
    listProofs()
      .then((rows) => {
        const report = findReport(rows, id ?? "");
        setGroup(report);
        const reportId = report[0]?.reportId ?? "";
        getLocalNote(reportId).then(setNote).catch(() => setNote(null));
        const sent = report.find((r) => r.status !== "pending_sync");
        if (sent && getTask(sent.taskId).confirmations) {
          fetchConfirmations(API_URL, sent.proofHash).then(setReports).catch(() => setReports(null));
        } else {
          setReports(null);
        }
      })
      .catch(() => setGroup([]));
  }, [id]);

  useFocusEffect(useCallback(() => load(), [load]));

  const checkNow = () => {
    setChecking(true);
    runPendingSync()
      .then((s) => {
        load();
        void announce(syncResult(s, true));
      })
      .catch(() => undefined)
      .finally(() => setChecking(false));
  };

  if (group.length === 0) {
    return (
      <Screen>
        <BackLink label="My reports" onPress={() => router.back()} />
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
  const stages = reportStages(group);
  const photos = group.length;
  const live = reports ? liveConfirmations(task, reports, identityStepEnabled()) : null;
  const liveNote = live ? confirmationsNote(live) : null;

  return (
    <Screen>
      <BackLink label="My reports" onPress={() => router.back()} />
      <TaskHeader category={task.category} title={task.title} subtitle={task.purpose} />

      <View style={styles.summary}>
        <View style={styles.summaryTop}>
          <Text style={styles.sectionLabel}>Report summary</Text>
          <StatusPill status={status} count={minCount} />
        </View>
        <View style={styles.facts}>
          <Fact icon="photo" label={photos === 1 ? "1 photo" : `${photos} photos`} />
          <Fact icon="location" label={task.area} />
          <Fact icon="clock" label={new Date(newest.capturedAt).toLocaleDateString()} />
        </View>
      </View>

      {anyPending ? (
        <Notice tone="info" icon="offline">
          This report is ready to send. It will go out automatically when you have signal.
        </Notice>
      ) : null}

      <View style={styles.progressCard}>
        <Text style={styles.sectionTitle} accessibilityRole="header">Report progress</Text>
        <View style={styles.timeline}>
          {stages.map((s, i, arr) => (
            <View key={s.label} style={styles.stageRow} accessible accessibilityLabel={stageSpoken(s)}>
              <View style={styles.stageMarker}>
                <View style={[styles.node, s.done && styles.nodeDone, s.current && styles.nodeCurrent]}>
                  {s.done ? <Icon name="check" size={12} color={color.onPrimary} /> : null}
                </View>
                {i < arr.length - 1 ? (
                  <View style={[styles.connector, s.done && styles.connectorDone]} />
                ) : null}
              </View>
              <View style={styles.stageText}>
                <Text style={[styles.stageLabel, !s.done && !s.current && styles.stageUpcoming]}>
                  {s.label}
                </Text>
                <Text style={styles.stageDetail}>{s.detail}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      {task.confirmations ? (
        <View
          style={styles.community}
          accessible
          accessibilityLabel={
            live
              ? `Community confirmations. ${confirmationsLabel(live)}.${liveNote ? ` ${liveNote}` : ""}`
              : "Community confirmations not checked yet."
          }
        >
          <View style={styles.communityHead}>
            <Icon name="community" size={22} color={color.success} />
            <Text style={styles.sectionTitle}>
              {live ? confirmationsLabel(live) : "Community confirmations"}
            </Text>
          </View>
          {live ? (
            <View style={styles.segments}>
              {Array.from({ length: live.need }, (_, i) => (
                <View key={i} style={[styles.segment, i < live.have && styles.segmentOn]} />
              ))}
            </View>
          ) : null}
          <Text style={styles.stageDetail}>
            {live
              ? "Independent reports from people near this activity. Each one adds a confirmation."
              : "Not checked yet. The count appears once your report is sent and the phone is online."}
          </Text>
          {liveNote ? <Text style={styles.stageDetail}>{liveNote}</Text> : null}
        </View>
      ) : null}

      {note ? (
        <View style={styles.note}>
          <Text style={styles.noteLabel}>Your private note</Text>
          <Text style={styles.noteText}>{note}</Text>
          <Text style={styles.noteHint}>Only on this phone. Not part of the report.</Text>
        </View>
      ) : null}

      {!anyPending ? (
        <>
          <SecondaryButton
            label="See public record"
            icon="review"
            onPress={() => void openInApp(publicRecordUrl(newest.proofHash))}
          />
          <SecondaryButton label="Check for updates" icon="retry" onPress={checkNow} disabled={checking} />
        </>
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
        <View style={showTech ? styles.chevronOpen : undefined}>
          <Icon name="chevron" size={14} color={color.faint} />
        </View>
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
          <TechRow label="On-chain attestations" value={String(minCount)} />

          <Text style={styles.refLabel}>References</Text>
          {group.map((r) => (
            <Pressable
              key={r.id}
              onPress={() => void openInApp(publicRecordUrl(r.proofHash))}
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

function Fact({ icon, label }: { icon: "photo" | "location" | "clock"; label: string }) {
  return (
    <View style={styles.fact}>
      <Icon name={icon} size={15} color={color.primary} />
      <Text style={styles.factText} numberOfLines={1}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { ...type.body, color: color.muted },
  pressed: { opacity: 0.7 },
  summary: { gap: space.md, padding: space.md, borderRadius: radius.md, backgroundColor: color.surface, borderWidth: 1, borderColor: color.border },
  summaryTop: { gap: space.sm, alignItems: "flex-start" },
  sectionLabel: { ...type.meta, color: color.muted, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  facts: { gap: space.sm },
  fact: { flexDirection: "row", alignItems: "center", gap: space.sm },
  factText: { ...type.meta, color: color.text, flex: 1 },
  progressCard: { gap: space.md, padding: space.md, borderRadius: radius.md, backgroundColor: color.surface, borderWidth: 1, borderColor: color.border },
  sectionTitle: { ...type.subtitle, color: color.text },
  timeline: { gap: 0, paddingVertical: space.sm },
  stageRow: { flexDirection: "row", gap: space.md, alignItems: "flex-start" },
  stageMarker: { alignItems: "center", width: 22, alignSelf: "stretch" },
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
  connector: { width: 2, flex: 1, minHeight: 26, backgroundColor: color.border },
  connectorDone: { backgroundColor: color.success },
  stageText: { flex: 1, gap: 2, paddingBottom: space.lg },
  stageLabel: { ...type.subtitle, color: color.text },
  stageDetail: { ...type.meta, color: color.muted },
  stageUpcoming: { color: color.faint },
  community: { gap: space.sm, padding: space.md, borderRadius: radius.md, backgroundColor: color.surface, borderWidth: 1, borderColor: color.border },
  communityHead: { flexDirection: "row", alignItems: "center", gap: space.sm },
  segments: { flexDirection: "row", gap: space.xs },
  segment: { flex: 1, height: 8, borderRadius: radius.pill, backgroundColor: color.border },
  segmentOn: { backgroundColor: color.success },
  note: { gap: space.xs, padding: space.md, borderRadius: radius.md, backgroundColor: color.surfaceSoft },
  noteLabel: { ...type.meta, color: color.muted, fontWeight: "700" },
  noteText: { ...type.body, color: color.text },
  noteHint: { ...type.meta, color: color.muted },
  chevronOpen: { transform: [{ rotate: "90deg" }] },
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
