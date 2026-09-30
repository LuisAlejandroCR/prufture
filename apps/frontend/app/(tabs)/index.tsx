// (tabs)/index.tsx: Missions — the reporter's home. Greeting, private contribution strip, resume and
// waiting-to-send notices, then "Missions near you" (reportable, within REPORTABLE_KM) as List or Map of
// approximate areas (never pins), "Missions around the world" (view only), and a way into the full
// catalog, which works anywhere. Home and the old Tasks tab are one screen now.

import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { CellMap, type MapCell } from "../../src/components/CellMap";
import { Icon, type IconName } from "../../src/components/icons/Icon";
import { Appear, BrandMark, CategoryBadge, OfflinePill, Screen } from "../../src/components/ui";
import { select } from "../../src/feedback";
import {
  confirmedReportCount,
  greeting,
  missionPlace,
  missionQuestion,
  nearMePrompt,
  showReachError,
} from "../../src/home";
import { listProofs } from "../../src/queue";
import type { LocalProof } from "../../src/queue-row";
import {
  clearDraft,
  clearPersistedDraft,
  hasPersistedDraft,
  isResumable,
  restoreDraft,
  resumeTarget,
} from "../../src/report-draft";
import {
  EXAMPLE_ASSIGNMENTS,
  REPORTABLE_KM,
  distanceLabel,
  getTask,
  listTasks,
  splitMissions,
  type TaskDef,
} from "../../src/tasks";
import { color, radius, shadow, space, target, type } from "../../src/theme";
import { useApproxArea } from "../../src/useApproxArea";
import { runPendingSync } from "../../src/useAutoSync";
import { useOnline } from "../../src/useOnline";
import { loadMissionsView, saveMissionsView } from "../../src/view-pref";

type View_ = "list" | "map";

export default function MissionsScreen() {
  const router = useRouter();
  const online = useOnline();
  const { cell, centre, status, canAskAgain, requestArea } = useApproxArea();
  const [pending, setPending] = useState(0);
  const [confirmed, setConfirmed] = useState(0);
  const [lastSync, setLastSync] = useState({ synced: 0, failed: 0 });
  const [view, setView] = useState<View_>("list");
  const picked = useRef(false);
  const [unfinished, setUnfinished] = useState<{ taskId: string } | null>(null);
  const { near, world } = useMemo(() => splitMissions(listTasks(), cell), [cell]);

  const count = useCallback((rows: LocalProof[]) => {
    setPending(rows.filter((r) => r.status === "pending_sync").length);
    setConfirmed(confirmedReportCount(rows));
  }, []);

  // Try to send whatever is waiting, then recount. Runs on focus and again when signal returns.
  const syncWaiting = useCallback(() => {
    listProofs()
      .then((rows) => {
        count(rows);
        if (!rows.some((r) => r.status === "pending_sync")) return;
        runPendingSync()
          .then((s) => {
            setLastSync({ synced: s.synced, failed: s.failed });
            listProofs().then(count).catch(() => undefined);
          })
          .catch(() => undefined);
      })
      .catch(() => {
        setPending(0);
        setConfirmed(0);
      });
  }, [count]);

  useFocusEffect(
    useCallback(() => {
      hasPersistedDraft()
        .then((meta) => setUnfinished(meta && isResumable(meta) ? { taskId: meta.taskId } : null))
        .catch(() => setUnfinished(null));
      syncWaiting();
    }, [syncWaiting]),
  );

  useEffect(() => {
    if (online) syncWaiting();
  }, [online, syncWaiting]);

  useEffect(() => {
    // The stored view loads in the background; a choice the user already made wins over it.
    loadMissionsView()
      .then((v) => {
        if (!picked.current) setView(v);
      })
      .catch(() => undefined);
  }, []);
  const chooseView = (v: View_) => {
    picked.current = true;
    if (v !== view) void select();
    setView(v);
    void saveMissionsView(v);
  };

  const [refreshing, setRefreshing] = useState(false);
  const refresh = () => {
    setRefreshing(true);
    syncWaiting();
    setTimeout(() => setRefreshing(false), 700);
  };

  const reachError = showReachError({ online, pending, ...lastSync });

  const open = (id: string) => router.push({ pathname: "/task/[id]", params: { id } });

  const continueUnfinished = async () => {
    if (!unfinished) return;
    const draft = await restoreDraft();
    if (!draft) {
      router.push({ pathname: "/report/intro", params: { id: unfinished.taskId } });
      return;
    }
    const next = resumeTarget(draft, getTask(unfinished.taskId));
    router.push({ pathname: next.pathname, params: next.params });
  };

  const discardUnfinished = async () => {
    clearDraft();
    await clearPersistedDraft();
    setUnfinished(null);
  };

  const mapCells: MapCell[] = [
    ...(cell ? [{ key: "me", cell, tone: "self" as const }] : []),
    ...[...near, ...world].map((t) => ({ key: t.id, cell: t.cell, title: t.title, tone: "task" as const, onPress: () => open(t.id) })),
  ];

  return (
    <Screen onRefresh={refresh} refreshing={refreshing}>
      <View style={styles.top}>
        <BrandMark />
        <OfflinePill online={online} />
      </View>

      <View style={{ gap: space.xs }}>
        <Text style={styles.hello} accessibilityRole="header">
          {greeting(new Date().getHours())}
        </Text>
        <Text style={styles.tagline}>Stronger communities, brighter tomorrows.</Text>
      </View>

      <Pressable
        onPress={() => router.push("/updates")}
        accessibilityRole="button"
        accessibilityLabel={`${confirmed} ${confirmed === 1 ? "report" : "reports"} confirmed. Open my reports.`}
        style={({ pressed }) => [styles.strip, pressed && styles.pressed]}
      >
        <Icon name="sprout" size={26} filled color={color.success} />
        <View style={styles.flex}>
          <Text style={styles.stripTitle}>
            {confirmed === 0
              ? "Your first report starts here"
              : `${confirmed} ${confirmed === 1 ? "report" : "reports"} confirmed`}
          </Text>
          <Text style={styles.stripBody}>Small actions make a real difference.</Text>
        </View>
        <Icon name="chevron" size={18} color={color.faint} />
      </Pressable>

      {reachError ? (
        <View style={styles.inline}>
          <Icon name="offline" size={16} color={color.warning} />
          <Text style={styles.inlineText}>Could not reach the server. It will retry.</Text>
        </View>
      ) : null}

      {pending > 0 ? (
        <Pressable
          onPress={() => router.push("/updates")}
          accessibilityRole="button"
          accessibilityLabel={`${pending} ${pending === 1 ? "report" : "reports"} saved on this phone, waiting to send. Open my reports.`}
          style={({ pressed }) => [styles.queue, pressed && styles.pressed]}
        >
          <Icon name="privacy" size={20} color={color.success} />
          <Text style={styles.queueText}>
            {pending} {pending === 1 ? "report is" : "reports are"} saved on this phone. They send
            automatically when you have signal.
          </Text>
          <Icon name="chevron" size={16} color={color.faint} />
        </Pressable>
      ) : null}

      {unfinished ? (
        <View style={styles.resume}>
          <Text style={styles.resumeTitle}>Unfinished report</Text>
          <Text style={styles.resumeBody}>
            “{getTask(unfinished.taskId).title}” is saved on this phone. Pick up where you left off,
            or start over.
          </Text>
          <View style={styles.resumeActions}>
            <SmallButton label="Continue" primary onPress={continueUnfinished} hint="Continue the unfinished report" />
            <SmallButton label="Start over" onPress={discardUnfinished} hint="Delete the unfinished report from this phone" />
          </View>
        </View>
      ) : null}

      <View style={styles.sectionHead}>
        <Text style={styles.section} accessibilityRole="header">
          Missions near you
        </Text>
        <View style={styles.approx}>
          <Text style={styles.approxText}>Approximate areas only</Text>
          <Icon name="info" size={14} color={color.muted} />
        </View>
      </View>

      {EXAMPLE_ASSIGNMENTS ? (
        <View style={styles.example} accessibilityRole="text">
          <Icon name="info" size={14} color={color.information} />
          <Text style={styles.exampleText}>Example missions for this pilot. Your programme team will add real ones.</Text>
        </View>
      ) : null}

      <View style={styles.toggle} accessibilityRole="tablist">
        {(["list", "map"] as const).map((v) => (
          <ToggleItem key={v} value={v} active={view === v} onPress={() => chooseView(v)} />
        ))}
      </View>

      {cell ? (
        <CellMap
          cells={mapCells}
          height={view === "map" ? 340 : 170}
          focusCell={cell}
          cityCentre={centre}
          offlineLabel="Map available when online. Your missions are listed below and work offline."
        />
      ) : (
        <NearMeCard prompt={nearMePrompt(status, canAskAgain)} onAsk={requestArea} />
      )}

      <View style={{ gap: space.sm }}>
        {near.map((t, i) => (
          <Appear key={t.id} index={i}>
            <MissionRow task={t} place={missionPlace(t, distanceLabel(cell, t))} onPress={() => open(t.id)} />
          </Appear>
        ))}
        {near.length === 0 ? (
          <Text style={styles.rowMeta}>
            {cell
              ? `No missions within ${REPORTABLE_KM} km of you yet. You can still report something else below.`
              : "Share your approximate area to see which missions you can report."}
          </Text>
        ) : null}
      </View>

      {world.length > 0 ? (
        <>
          <View style={{ gap: space.xs }}>
            <Text style={styles.section} accessibilityRole="header">
              Missions around the world
            </Text>
            <Text style={styles.rowMeta}>
              {`Reported only by people within ${REPORTABLE_KM} km. Open one to see what the programme needs.`}
            </Text>
          </View>
          <View style={{ gap: space.sm }}>
            {world.map((t, i) => (
              <Appear key={t.id} index={near.length + i}>
                <MissionRow
                  task={t}
                  place={missionPlace(t, distanceLabel(cell, t))}
                  note={cell ? "Too far to report from here" : "Share your area to report"}
                  onPress={() => open(t.id)}
                />
              </Appear>
            ))}
          </View>
        </>
      ) : null}

      <Pressable
        onPress={() => router.push("/report/pick")}
        accessibilityRole="button"
        accessibilityLabel="Report something else. Water points, schools, clinics and more."
        style={({ pressed }) => [styles.other, pressed && styles.pressed]}
      >
        <View style={styles.otherIcon}>
          <Icon name="report" size={22} color={color.primary} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.rowTitle}>Report something else</Text>
          <Text style={styles.rowMeta}>Not on the list? Water points, classrooms, fridges and more.</Text>
        </View>
        <Icon name="chevron" size={18} color={color.faint} />
      </Pressable>
    </Screen>
  );
}

function MissionRow({
  task,
  place,
  note,
  onPress,
}: {
  task: TaskDef;
  place: string;
  /** View-only missions say why they cannot be reported from here. */
  note?: string;
  onPress: () => void;
}) {
  const question = missionQuestion(task);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${task.title}. ${question}. ${place}.${task.progressLabel ? ` ${task.progressLabel}.` : ""}${note ? ` ${note}.` : ""}`}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <CategoryBadge category={task.category} />
      <View style={styles.flex}>
        <Text style={styles.rowTitle}>{task.title}</Text>
        <Text style={styles.rowMeta} numberOfLines={2}>
          {question}
        </Text>
        <View style={styles.place}>
          <Icon name="location" size={14} color={color.muted} />
          <Text style={styles.rowMeta}>{place}</Text>
        </View>
        {note ? <Text style={styles.rowNote}>{note}</Text> : null}
      </View>
      <Icon name="chevron" size={18} color={color.faint} />
    </Pressable>
  );
}

// Without the reporter's area the map would open on another continent's mission, so it waits until
// the reporter chooses to share an approximate area. The list below stays usable either way.
function NearMeCard({ prompt, onAsk }: { prompt: ReturnType<typeof nearMePrompt>; onAsk: () => Promise<void> }) {
  const onPress = () => {
    if (prompt.action === "settings") void Linking.openSettings();
    else if (prompt.action !== "none") void onAsk();
  };
  return (
    <View style={styles.nearMe}>
      <View style={styles.inline}>
        <Icon name="location" size={20} color={color.primary} />
        <Text style={styles.stripTitle}>See missions near you</Text>
      </View>
      <Text style={styles.stripBody}>
        Prufture uses an approximate area of about 5 km, never your exact position. You can still pick any
        mission from the list below.
      </Text>
      {prompt.action === "none" ? (
        <Text style={styles.stripBody}>{prompt.label}</Text>
      ) : (
        <View style={styles.resumeActions}>
          <SmallButton label={prompt.label} primary onPress={onPress} hint={prompt.label} />
        </View>
      )}
    </View>
  );
}

function ToggleItem({ value, active, onPress }: { value: View_; active: boolean; onPress: () => void }) {
  const label = value === "list" ? "List" : "Map";
  const icon: IconName = value;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`${label} view`}
      style={[styles.toggleItem, active && styles.toggleItemActive]}
    >
      <Icon name={icon} size={18} color={active ? color.onPrimary : color.text} />
      <Text style={[styles.toggleText, active && styles.toggleTextActive]}>{label}</Text>
    </Pressable>
  );
}

function SmallButton({ label, onPress, primary, hint }: { label: string; onPress: () => void; primary?: boolean; hint: string }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={hint}
      style={({ pressed }) => [styles.small, primary && styles.smallPrimary, pressed && styles.pressed]}
    >
      <Text style={[styles.smallText, primary && styles.smallTextPrimary]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.7 },
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", minHeight: target.min },
  hello: { ...type.display, color: color.text },
  tagline: { ...type.body, color: color.muted },
  strip: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
    ...shadow.card,
  },
  stripTitle: { ...type.subtitle, color: color.text },
  stripBody: { ...type.meta, color: color.muted },
  inline: { flexDirection: "row", alignItems: "center", gap: space.sm },
  inlineText: { ...type.meta, color: color.text, fontWeight: "600", flex: 1 },
  queue: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: color.successSoft,
  },
  queueText: { ...type.meta, flex: 1, color: color.text, fontWeight: "600" },
  nearMe: {
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
  },
  resume: { gap: space.sm, padding: space.md, borderRadius: radius.md, backgroundColor: color.primarySoft },
  resumeTitle: { ...type.meta, color: color.primary, fontWeight: "700" },
  resumeBody: { ...type.body, color: color.text },
  resumeActions: { flexDirection: "row", gap: space.sm },
  small: {
    minHeight: target.min,
    paddingHorizontal: space.md,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface,
  },
  smallPrimary: { backgroundColor: color.primary, borderColor: color.primary },
  smallText: { ...type.meta, color: color.text, fontWeight: "600" },
  smallTextPrimary: { color: color.onPrimary, fontWeight: "700" },
  sectionHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: space.sm },
  section: { ...type.title, color: color.text },
  example: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    paddingVertical: space.xs,
    paddingHorizontal: space.sm,
    borderRadius: radius.sm,
    backgroundColor: color.informationSoft,
  },
  exampleText: { ...type.meta, color: color.text, flex: 1 },
  approx: { flexDirection: "row", alignItems: "center", gap: space.xs },
  approxText: { ...type.meta, color: color.muted },
  toggle: { flexDirection: "row", padding: space.xs, gap: space.xs, borderRadius: radius.md, backgroundColor: color.surfaceSoft },
  toggleItem: {
    flex: 1,
    flexDirection: "row",
    gap: space.sm,
    minHeight: target.min,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
  },
  toggleItemActive: { backgroundColor: color.primary },
  toggleText: { ...type.subtitle, color: color.text },
  toggleTextActive: { color: color.onPrimary, fontWeight: "700" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
    ...shadow.card,
  },
  rowTitle: { ...type.subtitle, color: color.text },
  rowMeta: { ...type.meta, color: color.muted },
  rowNote: { ...type.meta, color: color.text, fontWeight: "600" },
  place: { flexDirection: "row", alignItems: "center", gap: space.xs, marginTop: 2 },
  other: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: color.surfaceSoft,
  },
  otherIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: color.surface,
    alignItems: "center",
    justifyContent: "center",
  },
});
