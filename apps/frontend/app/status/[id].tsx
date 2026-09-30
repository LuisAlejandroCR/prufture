// status/[id].tsx: the lifecycle of one report, kept short: a compact stepper over all its per-photo
// proofs (src/progress.ts; id may be a reportId, row id or proofHash) with one line for the current
// step. For an assignment the last step is live community confirmations from independent nearby
// reports (src/confirmations.ts); the public record alone never reads as "confirmed". The reporter's
// private note (local only) shows under it. When the programme pass is on, one line says whether its
// check was accepted (src/personhood-outcome.ts); its explanation and the proof references sit under
// Technical details. One action (See public record); pull down to check for updates.
// A coordinator's request for the photos shows as a yes/no prompt; nothing is sent without a yes, and
// a yes sends sealed photos only (src/evidence-share.ts). No PII, exact location or secrets.

import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { LayoutAnimation, Pressable, StyleSheet, Text, View } from "react-native";
import { Icon } from "../../src/components/icons/Icon";
import {
  BackLink,
  Notice,
  PrimaryButton,
  Screen,
  SecondaryButton,
  StatusPill,
  TaskHeader,
} from "../../src/components/ui";
import { announce, note as spoken, stageSpoken, syncResult } from "../../src/announce";
import {
  approveEvidenceRequest,
  declineEvidenceRequest,
  pendingEvidenceRequests,
  readLocalPhoto,
  shareCopy,
} from "../../src/evidence-share";
import {
  confirmationsNote,
  fetchConfirmations,
  liveConfirmations,
  type ConfirmationReport,
} from "../../src/confirmations";
import { identityStepEnabled } from "../../src/flags";
import { getOutcomes, personhoodOn } from "../../src/personhood-device";
import { reportPass, reportPassCopy, type ReportPass } from "../../src/personhood-outcome";
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
  // Coordinator requests for this report's photos, waiting for the reporter's yes or no.
  const [requested, setRequested] = useState<string[]>([]);
  const [answering, setAnswering] = useState(false);
  const [shareNotice, setShareNotice] = useState<string | null>(null);
  const copy = shareCopy();
  // null = not checked (offline, unsent or api unreachable): no count is shown rather than a guess.
  const [reports, setReports] = useState<ConfirmationReport[] | null>(null);
  // null = no programme-pass check was attempted for this report (or the pass is off): no line.
  const [pass, setPass] = useState<ReportPass | null>(null);

  const load = useCallback(() => {
    listProofs()
      .then((rows) => {
        const report = findReport(rows, id ?? "");
        setGroup(report);
        const reportId = report[0]?.reportId ?? "";
        getLocalNote(reportId).then(setNote).catch(() => setNote(null));
        const mine = new Set(report.map((r) => r.proofHash));
        if (personhoodOn()) {
          getOutcomes([...mine])
            .then((records) => setPass(reportPass(records, Date.now())))
            .catch(() => setPass(null));
        } else {
          setPass(null);
        }
        pendingEvidenceRequests()
          .then((all) => setRequested(all.filter((h) => mine.has(h))))
          .catch(() => setRequested([]));
        const sent = report.find((r) => r.status !== "pending_sync");
        if (sent && getTask(sent.taskId).confirmations) {
          fetchConfirmations(API_URL, sent.proofHash).then(setReports).catch(() => setReports(null));
        } else {
          setReports(null);
        }
      })
      .catch(() => setGroup([]));
  }, [id]);

  const approveShare = () => {
    setAnswering(true);
    const proofs = group
      .filter((r) => requested.includes(r.proofHash))
      .map((r) => ({ proofHash: r.proofHash, readPhoto: () => readLocalPhoto(r.mediaUri) }));
    approveEvidenceRequest(proofs, API_URL, (input, init) => fetch(input, init))
      .then((res) => {
        const message = !res.ok
          ? copy.unavailable
          : res.missing > 0
            ? copy.missing
            : "Thank you. The photos will be sent, locked, when you have signal.";
        setShareNotice(message);
        void announce(spoken(message));
      })
      .catch(() => undefined)
      .finally(() => {
        setAnswering(false);
        setRequested([]);
      });
  };

  const declineShare = () => {
    const message = "Okay. Your photos stay on this phone.";
    void declineEvidenceRequest(requested).finally(() => {
      setRequested([]);
      setShareNotice(message);
      void announce(spoken(message));
    });
  };

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
  const photos = group.length;
  const live = reports ? liveConfirmations(task, reports, identityStepEnabled()) : null;
  const liveNote = live ? confirmationsNote(live) : null;
  const passCopy = pass ? reportPassCopy(pass) : null;
  const community = task.confirmations ? { have: live ? live.have : null, need: live?.need ?? task.confirmations.need } : null;
  const communityDone = !!live && live.have >= live.need;
  const status = anyPending
    ? friendlyStatus("pending_sync")
    : task.confirmations
      ? (communityDone ? "confirmed" : "waiting")
      : friendlyStatus(group.every((r) => r.status === "attested") ? "attested" : "synced", minCount);
  const stages = reportStages(group, community);
  const current = stages.find((s) => s.current) ?? stages[stages.length - 1]!;

  return (
    <Screen onRefresh={checkNow} refreshing={checking}>
      <BackLink label="My reports" onPress={() => router.back()} />
      <TaskHeader category={task.category} title={task.title} subtitle={task.purpose} />

      <View style={styles.summary}>
        <View style={styles.summaryTop}>
          <Text style={styles.sectionLabel}>Report summary</Text>
          <StatusPill status={status} count={task.confirmations ? live?.have : minCount} />
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

      {requested.length > 0 ? (
        <View style={styles.requestCard}>
          <Text style={styles.sectionTitle} accessibilityRole="header">{copy.requestTitle}</Text>
          <Text style={styles.body}>{copy.requestBody}</Text>
          <PrimaryButton label="Share photos" onPress={approveShare} busy={answering} />
          <SecondaryButton label="Don't share" onPress={declineShare} disabled={answering} />
        </View>
      ) : null}

      {shareNotice ? <Notice tone="info" icon="privacy">{shareNotice}</Notice> : null}

      <View style={styles.progressCard}>
        <View style={styles.stepper}>
          {stages.map((s, i, arr) => (
            <View key={s.label} style={styles.step} accessible accessibilityLabel={stageSpoken(s)}>
              <View style={styles.stepTrack}>
                <View style={[styles.connector, i === 0 && styles.connectorHidden, s.done && styles.connectorDone]} />
                <View style={[styles.node, s.done && styles.nodeDone, s.current && styles.nodeCurrent]}>
                  {s.done ? <Icon name="check" size={12} color={color.onPrimary} /> : null}
                </View>
                <View
                  style={[
                    styles.connector,
                    i === arr.length - 1 && styles.connectorHidden,
                    arr[i + 1]?.done && styles.connectorDone,
                  ]}
                />
              </View>
              <Text style={[styles.stepLabel, !s.done && !s.current && styles.stageUpcoming]} numberOfLines={1}>
                {s.short}
              </Text>
            </View>
          ))}
        </View>
        <View style={{ gap: 2 }}>
          <Text style={styles.stageLabel}>{current.label}</Text>
          <Text style={styles.stageDetail}>{current.detail}</Text>
          {liveNote ? <Text style={styles.stageDetail}>{liveNote}</Text> : null}
        </View>
      </View>

      {pass && passCopy ? (
        <View style={styles.passLine} accessible accessibilityLabel={passCopy.title}>
          <Icon
            name={pass.outcome === "verified" ? "check" : "programme"}
            size={18}
            color={pass.outcome === "verified" ? color.success : color.muted}
          />
          <Text style={styles.passText}>{passCopy.title}</Text>
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
        <SecondaryButton
          label="See public record"
          icon="review"
          onPress={() => void openInApp(publicRecordUrl(newest.proofHash))}
        />
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

      {showTech && passCopy ? <Text style={styles.stageDetail}>{passCopy.body}</Text> : null}

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
  requestCard: { gap: space.md, padding: space.md, borderRadius: radius.md, backgroundColor: color.surface, borderWidth: 1, borderColor: color.primary },
  progressCard: { gap: space.md, padding: space.md, borderRadius: radius.md, backgroundColor: color.surface, borderWidth: 1, borderColor: color.border },
  sectionTitle: { ...type.subtitle, color: color.text },
  stepper: { flexDirection: "row" },
  step: { flex: 1, alignItems: "center", gap: space.xs },
  stepTrack: { flexDirection: "row", alignItems: "center", alignSelf: "stretch" },
  stepLabel: { ...type.meta, color: color.text, fontWeight: "600" },
  connectorHidden: { opacity: 0 },
  passLine: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.xs },
  passText: { ...type.body, color: color.text, flex: 1 },
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
  connector: { height: 2, flex: 1, backgroundColor: color.border },
  connectorDone: { backgroundColor: color.success },
  stageLabel: { ...type.subtitle, color: color.text },
  stageDetail: { ...type.meta, color: color.muted },
  stageUpcoming: { color: color.faint },
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
