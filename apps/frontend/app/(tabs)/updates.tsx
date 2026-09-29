// (tabs)/updates.tsx: "My reports" — a private contribution card (confirmed reports, no ranking),
// then what happened after each report was sent — one card per report (per-photo
// proofs grouped by the local reportId), friendly status and relative time, plus a manual
// "check now". No hashes, no error traces.

import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { Icon } from "../../src/components/icons/Icon";
import { Illustration } from "../../src/components/Illustration";
import { confirmedReportCount } from "../../src/home";
import { Appear, CategoryBadge, Notice, Screen, ScreenTitle, StatusPill } from "../../src/components/ui";
import { listProofs } from "../../src/queue";
import type { LocalProof } from "../../src/queue-row";
import { getTask } from "../../src/tasks";
import { runPendingSync } from "../../src/useAutoSync";
import { color, radius, space, type, type FriendlyStatus } from "../../src/theme";

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} h ago`;
  return `${Math.round(hrs / 24)} d ago`;
}

interface ReportGroup {
  /** reportId when present, otherwise the single row id (pre-hotfix rows). */
  key: string;
  rows: LocalProof[];
}

/** Group per-photo rows into reports. Rows arrive newest-first and stay that way. */
export function groupReports(rows: LocalProof[]): ReportGroup[] {
  const order: string[] = [];
  const byKey = new Map<string, LocalProof[]>();
  for (const r of rows) {
    const key = r.reportId || `row:${r.id}`;
    const bucket = byKey.get(key);
    if (bucket) bucket.push(r);
    else {
      byKey.set(key, [r]);
      order.push(key);
    }
  }
  return order.map((key) => ({ key, rows: byKey.get(key) as LocalProof[] }));
}

/** Combined status of a report: the least-advanced of its rows. */
export function combinedStatus(rows: LocalProof[]): FriendlyStatus {
  if (rows.some((r) => r.status === "pending_sync")) return "ready";
  if (rows.some((r) => r.status === "synced" && r.attestationCount === 0)) return "waiting";
  return "confirmed";
}

export default function UpdatesScreen() {
  const router = useRouter();
  const [rows, setRows] = useState<LocalProof[]>([]);
  const [checking, setChecking] = useState(false);
  const [reachError, setReachError] = useState(false);

  const refresh = useCallback(() => {
    listProofs()
      .then(setRows)
      .catch(() => setRows([]));
  }, []);

  useFocusEffect(useCallback(() => refresh(), [refresh]));

  const checkNow = () => {
    setChecking(true);
    runPendingSync()
      .then((s) => {
        setReachError(s.failed > 0 && s.synced === 0);
        refresh();
      })
      .catch(() => undefined)
      .finally(() => setChecking(false));
  };

  const groups = groupReports(rows);
  const confirmed = confirmedReportCount(rows);

  const contribution = (
    <View style={styles.contribution} accessibilityRole="summary">
      <Illustration scene="growth" height={96} />
      <View style={styles.contributionBody}>
        <Text style={styles.contributionTitle}>Your contribution</Text>
        <Text style={styles.contributionCount}>
          {confirmed} {confirmed === 1 ? "report" : "reports"} confirmed
        </Text>
        <Text style={styles.contributionNote}>No ranking. Every useful report counts. Only you see this.</Text>
      </View>
    </View>
  );

  return (
    <Screen scroll={false}>
      <ScreenTitle hint="Every report you have made, newest first.">My reports</ScreenTitle>

      {reachError ? (
        <Notice tone="warning" icon="offline">
          Could not reach the server — will retry.
        </Notice>
      ) : null}

      {groups.length === 0 ? (
        <View style={styles.empty}>
          {contribution}
          <Icon name="review" size={32} color={color.faint} />
          <Text style={styles.emptyTitle}>No reports yet</Text>
          <Text style={styles.emptyBody}>
            When you finish a report it appears here, and you can follow it from saved to confirmed.
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.flex}
          contentContainerStyle={{ gap: space.sm, paddingBottom: space.xl }}
          refreshControl={<RefreshControl refreshing={checking} onRefresh={checkNow} tintColor={color.primary} />}
        >
          {contribution}
          {groups.map((g, gi) => {
            const newest = g.rows[0];
            if (!newest) return null;
            const task = getTask(newest.taskId);
            const status = combinedStatus(g.rows);
            const photos = g.rows.length;
            const target = newest.reportId || newest.id;
            return (
              <Appear key={g.key} index={gi}>
                <Pressable
                  onPress={() => router.push({ pathname: "/status/[id]", params: { id: target } })}
                  accessibilityRole="button"
                  accessibilityLabel={`${task.title}. ${task.area}. Status ${status}. ${photos} ${photos === 1 ? "photo" : "photos"}. ${relativeTime(newest.createdAt)}.`}
                  style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                >
                  <CategoryBadge category={task.category} size={44} />
                  <View style={styles.flex}>
                    <Text style={styles.rowTitle} numberOfLines={2}>
                      {task.title}
                    </Text>
                    <Text style={styles.rowMeta}>
                      {task.area} · {relativeTime(newest.createdAt)}
                    </Text>
                    <View style={styles.pillRow}>
                      <StatusPill status={status} />
                    </View>
                    <Text style={styles.count}>
                      {photos} {photos === 1 ? "photo" : "photos"}
                    </Text>
                  </View>
                  <Icon name="chevron" size={18} color={color.faint} />
                </Pressable>
              </Appear>
            );
          })}
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  empty: { alignItems: "center", gap: space.sm, paddingVertical: space.xxl },
  emptyTitle: { ...type.title, color: color.text },
  emptyBody: { ...type.body, color: color.muted, textAlign: "center" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
  },
  pressed: { opacity: 0.7 },
  rowTitle: { ...type.subtitle, color: color.text },
  rowMeta: { ...type.meta, color: color.muted, marginTop: 2 },
  pillRow: { marginTop: space.sm },
  count: { ...type.meta, color: color.faint, marginTop: space.xs },
  contribution: {
    alignSelf: "stretch",
    borderRadius: radius.md,
    overflow: "hidden",
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
    marginBottom: space.sm,
  },
  contributionBody: { padding: space.md, gap: 2 },
  contributionTitle: { ...type.meta, color: color.muted, fontWeight: "700" },
  contributionCount: { ...type.title, color: color.success },
  contributionNote: { ...type.meta, color: color.muted },
});
