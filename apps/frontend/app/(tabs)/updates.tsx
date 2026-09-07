// (tabs)/updates.tsx: what happened after each report was sent. Simple chronological
// list, friendly status, relative time, one next action on a problem. No hashes,
// no error traces. Presentation over src/queue + src/sync (manual "check now").

import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import type { QueuedProof } from "@proof/core";
import { Icon } from "../../src/components/icons/Icon";
import { Screen, ScreenTitle, StatusPill } from "../../src/components/ui";
import { listProofs } from "../../src/queue";
import { getTask } from "../../src/tasks";
import { runPendingSync } from "../../src/useAutoSync";
import { color, friendlyStatus, radius, space, type } from "../../src/theme";

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

export default function UpdatesScreen() {
  const router = useRouter();
  const [rows, setRows] = useState<QueuedProof[]>([]);
  const [checking, setChecking] = useState(false);

  const refresh = useCallback(() => {
    listProofs()
      .then(setRows)
      .catch(() => setRows([]));
  }, []);

  useFocusEffect(useCallback(() => refresh(), [refresh]));

  const checkNow = () => {
    setChecking(true);
    runPendingSync()
      .then(() => refresh())
      .catch(() => undefined)
      .finally(() => setChecking(false));
  };

  return (
    <Screen scroll={false}>
      <ScreenTitle hint="Every report you have made, newest first.">Updates</ScreenTitle>

      {rows.length === 0 ? (
        <View style={styles.empty}>
          <Icon name="updates" size={32} color={color.faint} />
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
          {rows.map((r) => {
            const task = getTask(r.taskId);
            const status = friendlyStatus(r.status, r.attestationCount);
            const needsAction = false; // recoverable errors are surfaced on the status screen
            return (
              <Pressable
                key={r.id}
                onPress={() => router.push({ pathname: "/status/[id]", params: { id: r.id } })}
                accessibilityRole="button"
                accessibilityLabel={`${task.title}. ${task.area}. Status ${status}. ${relativeTime(r.createdAt)}.`}
                style={({ pressed }) => [styles.row, pressed && styles.pressed]}
              >
                <View style={styles.flex}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {task.title}
                  </Text>
                  <Text style={styles.rowMeta}>
                    {task.area} · {relativeTime(r.createdAt)}
                  </Text>
                  <View style={styles.pillRow}>
                    <StatusPill status={status} count={r.attestationCount} />
                  </View>
                  {needsAction ? (
                    <Text style={styles.action}>Try again</Text>
                  ) : null}
                </View>
                <Icon name="chevron" size={18} color={color.faint} />
              </Pressable>
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
  action: { ...type.meta, color: color.attention, fontWeight: "700", marginTop: space.xs },
});
