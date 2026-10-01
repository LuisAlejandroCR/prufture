// coordinator.tsx: the paid review tool for programme coordinators, opened from Me. Without a plan it
// explains what the plan does and links to the paywall; with one it lists reports from the api's
// /coordinator/* routes (server-checked entitlement) under a short summary, records accept/reject, and
// drafts an email of the summary in the coordinator's own mail app. The full list and the CSV export
// live on the web dashboard.

import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Linking, Platform, Pressable, Share, StyleSheet, Text, TextInput, View } from "react-native";
import { BackLink, Card, Notice, PrimaryButton, Screen, ScreenTitle, SecondaryButton, SectionLabel } from "../src/components/ui";
import {
  COMMUNITY_LABEL,
  communityState,
  fetchCoordinatorReports,
  joinProgramme,
  recordReview,
  type CoordinatorReport,
  type ReviewStatus,
} from "../src/coordinator-api";
import { coordinatorIdMessage } from "../src/coordinator-id";
import { newSinceLastVisit, readLastCoordinatorVisit, writeLastCoordinatorVisit } from "../src/local-notices";
import { coordinatorSummary, summaryEmail, summaryMailto } from "../src/coordinator-summary";
import { siteUrl } from "../src/links";
import { getAppUserId, showManageSubscriptions } from "../src/purchases";
import { getTask } from "../src/tasks";
import { API_URL } from "../src/useAutoSync";
import { useEntitlement } from "../src/useEntitlement";
import { color, radius, space, target, type } from "../src/theme";

type ListState =
  | { kind: "loading" }
  | { kind: "locked" }
  | { kind: "unavailable" }
  | { kind: "ready"; rows: CoordinatorReport[]; sample: boolean; appUserId: string; newSince: number };

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
    if (result.kind !== "ok") {
      setList({ kind: result.kind });
      return;
    }
    // "New since your last visit": the last visit is kept only on this phone. Never for the sample.
    const last = result.data.sample ? null : await readLastCoordinatorVisit();
    const newSince = newSinceLastVisit(result.data.rows, last);
    if (!result.data.sample) void writeLastCoordinatorVisit(Date.now());
    setList({ kind: "ready", ...result.data, appUserId: id.data, newSince });
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
          ? { ...prev, rows: prev.rows.map((r) => (r.proofHash === row.proofHash ? result.data : r)) }
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

  // A programme code turns this subscriber into programme staff on the api; the real inbox follows.
  const join = async (code: string): Promise<void> => {
    setNotice(null);
    const id = await getAppUserId();
    if (!id.available) {
      setNotice("Couldn't check the code. Check your connection and try again.");
      return;
    }
    const outcome = await joinProgramme(API_URL, id.data, code);
    if (outcome === "joined") {
      void loadReports();
      return;
    }
    setNotice(
      outcome === "invalid"
        ? "That code wasn't accepted. Check it with your programme team."
        : outcome === "limited"
          ? "Too many tries. Wait an hour, then try again."
          : "Couldn't check the code. Check your connection and try again.",
    );
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
          onJoin={join}
        />
      )}

      {status === "entitled" && !locked ? (
        <Pressable
          onPress={() => void showManageSubscriptions(Platform.OS)}
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
  onJoin,
}: {
  list: ListState;
  busyHash: string | null;
  onReview: (row: CoordinatorReport, next: ReviewStatus) => void;
  onRetry: () => void;
  onEmail: (rows: CoordinatorReport[]) => void;
  onJoin: (code: string) => Promise<void>;
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
      {list.sample ? (
        <Card>
          <Notice tone="info">
            Sample reports. Your programme's reports appear here once the programme team adds your
            account. Reviews you make here only change this sample.
          </Notice>
          <Text style={styles.cardBody}>Your coordinator id</Text>
          <Text style={styles.coordinatorId} selectable accessibilityLabel={`Your coordinator id, ${list.appUserId}`}>
            {list.appUserId}
          </Text>
          <SecondaryButton
            label="Share my id"
            icon="report"
            onPress={() => void Share.share({ message: coordinatorIdMessage(list.appUserId) }).catch(() => undefined)}
          />
          <JoinForm onJoin={onJoin} />
        </Card>
      ) : null}
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
      {list.newSince > 0 ? (
        <Notice tone="info">
          {`${list.newSince} new ${list.newSince === 1 ? "report" : "reports"} since your last visit.`}
        </Notice>
      ) : null}
      {!list.sample ? (
        <SecondaryButton label="Email summary" icon="report" onPress={() => onEmail(list.rows)} disabled={list.rows.length === 0} />
      ) : null}
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

/** Redeem a programme code from the programme team. */
function JoinForm({ onJoin }: { onJoin: (code: string) => Promise<void> }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <View style={{ gap: space.sm, marginTop: space.md }}>
      <Text style={styles.cardBody}>Have a programme code? Enter it to see your programme's reports.</Text>
      <TextInput
        value={code}
        onChangeText={setCode}
        placeholder="Programme code"
        placeholderTextColor={color.muted}
        autoCapitalize="characters"
        autoCorrect={false}
        style={styles.codeInput}
        accessibilityLabel="Programme code"
      />
      <PrimaryButton
        label="Join programme"
        disabled={busy || code.trim().length === 0}
        onPress={() => {
          setBusy(true);
          void onJoin(code).finally(() => setBusy(false));
        }}
      />
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
          {when} · area {row.geohashRegion} · {COMMUNITY_LABEL[communityState(row)]}
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
  codeInput: {
    ...type.body,
    color: color.text,
    minHeight: target.min,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface,
  },
  coordinatorId: { ...type.body, color: color.text, fontWeight: "600", marginBottom: space.sm },
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
