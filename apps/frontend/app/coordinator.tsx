// coordinator.tsx: the paid review tool for programme coordinators, opened from Me. Without a plan it
// explains what the plan does and links to the paywall; with one it lists reports from the api's
// /coordinator/* routes (server-checked entitlement) under a short summary, records accept/reject, and
// drafts an email of the summary in the coordinator's own mail app. The full list and the CSV export
// live on the web dashboard.

import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { BackLink, Card, Notice, PrimaryButton, Screen, ScreenTitle, SecondaryButton, SectionLabel } from "../src/components/ui";
import { fetchCoordinatorReports, recordReview, type CoordinatorReport, type ReviewStatus } from "../src/coordinator-api";
import { coordinatorSummary, summaryEmail, summaryMailto } from "../src/coordinator-summary";
import { siteUrl } from "../src/links";
import { getAppUserId, manageSubscriptionsUrl } from "../src/purchases";
import { getTask } from "../src/tasks";
import { API_URL } from "../src/useAutoSync";
import { useEntitlement } from "../src/useEntitlement";
import { color, radius, space, target, type } from "../src/theme";

type ListState =
  | { kind: "loading" }
  | { kind: "locked" }
  | { kind: "unavailable" }
  | { kind: "ready"; rows: CoordinatorReport[] };

export default function CoordinatorScreen() {
  const router = useRouter();
  const { status, refresh } = useEntitlement();
  const [list, setList] = useState<ListState>({ kind: "loading" });
  const [busyHash, setBusyHash] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadReports = useCallback(async () => {
    setList({ kind: "loading" });
    const id = await getAppUserId();
    if (!id.available) {
      setList({ kind: "unavailable" });
      return;
    }
    const result = await fetchCoordinatorReports(API_URL, id.data);
    setList(result.kind === "ok" ? { kind: "ready", rows: result.data } : { kind: result.kind });
  }, []);

  // Re-check on focus so returning from the paywall picks up a new purchase.
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  useFocusEffect(
    useCallback(() => {
      if (status === "entitled") void loadReports();
    }, [status, loadReports]),
  );

  const review = async (row: CoordinatorReport, next: ReviewStatus) => {
    setBusyHash(row.proofHash);
    setNotice(null);
    const id = await getAppUserId();
    const result = id.available
      ? await recordReview(API_URL, id.data, { proofHash: row.proofHash, status: next, note: row.reviewNote })
      : { kind: "unavailable" as const };
    setBusyHash(null);
    if (result.kind === "ok") {
      setList((prev) =>
        prev.kind === "ready"
          ? { kind: "ready", rows: prev.rows.map((r) => (r.proofHash === row.proofHash ? result.data : r)) }
          : prev,
      );
      return;
    }
    if (result.kind === "locked") {
      setList({ kind: "locked" });
      return;
    }
    setNotice("Couldn't save the review. Check your connection and try again.");
  };

  const emailSummary = (rows: CoordinatorReport[]) => {
    setNotice(null);
    const mail = summaryEmail(coordinatorSummary(rows), siteUrl("dashboard"));
    Linking.openURL(summaryMailto(mail)).catch(() => setNotice("No mail app is set up on this phone."));
  };

  const locked = status === "free" || list.kind === "locked";

  return (
    <Screen>
      <BackLink label="Me" onPress={() => router.back()} />
      <ScreenTitle hint="For programme teams checking reports. Reporting stays free.">
        Coordinator review
      </ScreenTitle>

      {notice ? <Notice tone="warning">{notice}</Notice> : null}

      {status === "loading" ? (
        <View style={styles.center}>
          <ActivityIndicator color={color.primary} />
        </View>
      ) : status === "unavailable" ? (
        <View style={{ gap: space.md }}>
          <Notice tone="warning">
            We can't check your plan right now, so the review tools stay locked. Try again shortly.
          </Notice>
          <SecondaryButton label="Try again" icon="retry" onPress={refresh} />
        </View>
      ) : locked ? (
        <View style={{ gap: space.md }}>
          <Card>
            <Text style={styles.cardTitle}>What the coordinator plan includes</Text>
            <Text style={styles.cardBody}>
              See every report your programme received, mark each one accepted or rejected, and
              email yourself a summary. Reports show the task, a coarse area and the time.
              They never show who sent them.
            </Text>
          </Card>
          <PrimaryButton label="See plans" onPress={() => router.push("/paywall")} />
        </View>
      ) : (
        <ReportList
          list={list}
          busyHash={busyHash}
          onReview={review}
          onRetry={loadReports}
          onEmail={emailSummary}
        />
      )}

      {status === "entitled" && !locked ? (
        <Pressable
          onPress={() => Linking.openURL(manageSubscriptionsUrl(Platform.OS)).catch(() => undefined)}
          accessibilityRole="link"
          style={styles.manage}
        >
          <Text style={styles.manageText}>Manage subscription</Text>
        </Pressable>
      ) : null}
    </Screen>
  );
}

function ReportList({
  list,
  busyHash,
  onReview,
  onRetry,
  onEmail,
}: {
  list: ListState;
  busyHash: string | null;
  onReview: (row: CoordinatorReport, next: ReviewStatus) => void;
  onRetry: () => void;
  onEmail: (rows: CoordinatorReport[]) => void;
}) {
  if (list.kind === "loading" || list.kind === "locked") {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={color.primary} />
      </View>
    );
  }
  if (list.kind === "unavailable") {
    return (
      <View style={{ gap: space.md }}>
        <Notice tone="warning">Reports aren't reachable right now. Check your connection and try again.</Notice>
        <SecondaryButton label="Try again" icon="retry" onPress={onRetry} />
      </View>
    );
  }
  const s = coordinatorSummary(list.rows);
  return (
    <View style={{ gap: space.md }}>
      <Card>
        <View style={styles.stats}>
          <Stat value={s.counts.pending} label="To review" />
          <Stat value={s.counts.accepted} label="Accepted" />
          <Stat value={s.counts.rejected} label="Rejected" />
        </View>
        {s.topActivities.length > 0 ? (
          <Text style={styles.cardBody}>
            Most reported: {s.topActivities.map((a) => `${a.title} (${a.count})`).join(", ")}
          </Text>
        ) : null}
      </Card>
      <SecondaryButton label="Email summary" icon="report" onPress={() => onEmail(list.rows)} disabled={list.rows.length === 0} />
      <Text style={styles.hint}>The full list and the CSV export are on the web dashboard.</Text>
      <SectionLabel>Reports</SectionLabel>
      {list.rows.length === 0 ? (
        <Notice tone="info">No reports have reached the programme yet.</Notice>
      ) : (
        list.rows.map((row) => (
          <ReviewRow key={row.proofHash} row={row} busy={busyHash === row.proofHash} onReview={onReview} />
        ))
      )}
    </View>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.stat} accessible accessibilityLabel={`${value} ${label.toLowerCase()}`}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.rowMeta}>{label}</Text>
    </View>
  );
}

const STATUS_LABEL: Record<ReviewStatus, string> = {
  pending: "To review",
  accepted: "Accepted",
  rejected: "Rejected",
};

function ReviewRow({
  row,
  busy,
  onReview,
}: {
  row: CoordinatorReport;
  busy: boolean;
  onReview: (row: CoordinatorReport, next: ReviewStatus) => void;
}) {
  const title = getTask(row.taskId).title;
  const when = new Date(row.capturedAt).toLocaleString();
  return (
    <Card>
      <View style={{ gap: space.xs }}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowMeta}>
          {when} · area {row.geohashRegion} · {row.attestationCount}{" "}
          {row.attestationCount === 1 ? "confirmation" : "confirmations"}
        </Text>
        <Text style={[styles.rowStatus, row.reviewStatus !== "pending" && { color: color.text }]}>
          {STATUS_LABEL[row.reviewStatus]}
        </Text>
      </View>
      <View style={styles.actions}>
        {(["accepted", "rejected"] as const).map((next) => {
          const current = row.reviewStatus === next;
          return (
            <Pressable
              key={next}
              onPress={() => onReview(row, current ? "pending" : next)}
              disabled={busy}
              accessibilityRole="button"
              accessibilityState={{ selected: current, busy, disabled: busy }}
              accessibilityLabel={`${next === "accepted" ? "Accept" : "Reject"} report: ${title}`}
              style={({ pressed }) => [
                styles.action,
                current && (next === "accepted" ? styles.actionAccepted : styles.actionRejected),
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.actionText}>{next === "accepted" ? "Accept" : "Reject"}</Text>
            </Pressable>
          );
        })}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  center: { paddingVertical: space.xxl, alignItems: "center" },
  cardTitle: { ...type.subtitle, color: color.text, marginBottom: space.xs },
  cardBody: { ...type.body, color: color.muted },
  stats: { flexDirection: "row", marginBottom: space.sm },
  stat: { flex: 1, gap: 2 },
  statValue: { ...type.title, color: color.text },
  hint: { ...type.meta, color: color.muted },
  rowTitle: { ...type.subtitle, color: color.text },
  rowMeta: { ...type.meta, color: color.muted },
  rowStatus: { ...type.meta, color: color.muted, fontWeight: "700" },
  actions: { flexDirection: "row", gap: space.sm, marginTop: space.md },
  action: {
    flex: 1,
    minHeight: target.min,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface,
  },
  actionAccepted: { borderColor: color.success, backgroundColor: color.successSoft },
  actionRejected: { borderColor: color.warning, backgroundColor: color.warningSoft },
  actionText: { ...type.action, color: color.text },
  pressed: { opacity: 0.8 },
  manage: { minHeight: target.min, alignItems: "center", justifyContent: "center" },
  manageText: { ...type.action, color: color.primary },
});
