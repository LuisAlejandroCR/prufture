// index.tsx: queue screen — lists proofs and their sync state. Block 1 acceptance surface.
// Status reads at a glance via a colored pill: "pending sync", "synced", "attested by N".
// Styling is token-driven (src/theme.ts). Presentation only, no protocol change.

import { Link, useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import {
  AccessibilityInfo,
  FlatList,
  LayoutAnimation,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  UIManager,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { QueuedProof } from "@proof/core";
import { listProofs } from "../src/queue";
import { color, radius, space, target, type } from "../src/theme";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function QueueScreen() {
  const [proofs, setProofs] = useState<QueuedProof[]>([]);
  const known = useRef(0);
  const insets = useSafeAreaInsets();

  useFocusEffect(
    useCallback(() => {
      listProofs()
        .then(async (next) => {
          // MOTION_INTENSITY 2: animate only when a new row actually arrives.
          const reduced = await AccessibilityInfo.isReduceMotionEnabled().catch(() => false);
          if (!reduced && next.length !== known.current) {
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          }
          known.current = next.length;
          setProofs(next);
        })
        .catch(() => setProofs([]));
    }, []),
  );

  return (
    <View style={[styles.screen, { paddingBottom: insets.bottom + space.lg }]}>
      <FlatList
        style={styles.list}
        data={proofs}
        keyExtractor={(p) => p.id}
        contentContainerStyle={proofs.length === 0 ? styles.emptyWrap : styles.listContent}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Nothing captured yet</Text>
            <Text style={styles.emptyBody}>
              Capture works with no signal. Each proof is signed on this device and waits here
              until coverage returns.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={styles.rowMain}>
              <Text style={styles.task} numberOfLines={1}>
                {item.taskId}
              </Text>
              <Text style={styles.meta} numberOfLines={1}>
                #{item.proofHash.slice(0, 10)} · {item.geohash || "no geo cell"} · sig{" "}
                {item.signature.slice(0, 8)}…
              </Text>
            </View>
            <StatusPill proof={item} />
          </View>
        )}
      />

      <View style={styles.footer}>
        <Text style={styles.privacy}>
          What leaves your device: a hash, the task id, a coarse area, and the capture time. No photo,
          no name, no exact location.
        </Text>

        <Link href="/capture" asChild>
          <Pressable
            style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
            accessibilityRole="button"
            accessibilityLabel="Capture evidence"
          >
            <Text style={styles.ctaText}>Capture evidence</Text>
          </Pressable>
        </Link>
      </View>
    </View>
  );
}

function StatusPill({ proof }: { proof: QueuedProof }) {
  const map = {
    pending_sync: { label: "pending sync", bg: color.pendingBg, fg: color.pendingText },
    synced: { label: "synced", bg: color.syncedBg, fg: color.syncedText },
    attested: { label: `attested by ${proof.attestationCount}`, bg: color.attestedBg, fg: color.attestedText },
  } as const;
  const s = map[proof.status];
  return (
    <View style={[styles.pill, { backgroundColor: s.bg }]}>
      <Text style={[styles.pillText, { color: s.fg }]}>{s.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: space.lg, backgroundColor: color.bg },
  list: { flex: 1 },
  footer: { flexShrink: 0, gap: space.md },
  listContent: { paddingBottom: space.sm },
  emptyWrap: { flexGrow: 1, justifyContent: "center" },
  empty: { alignItems: "center", paddingHorizontal: space.md, gap: space.sm },
  emptyTitle: { ...type.title, color: color.text },
  emptyBody: { ...type.body, color: color.textMuted, textAlign: "center", lineHeight: 21 },
  row: {
    paddingVertical: space.md,
    borderBottomWidth: 1,
    borderBottomColor: color.border,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: space.md,
  },
  rowMain: { flex: 1, gap: space.xs },
  task: { ...type.title, color: color.text },
  meta: { ...type.meta, color: color.textFaint },
  pill: { paddingVertical: space.xs, paddingHorizontal: space.md, borderRadius: radius.pill },
  pillText: { fontSize: type.meta.fontSize, fontWeight: "700" },
  privacy: {
    ...type.meta,
    color: color.textMuted,
    lineHeight: 17,
    paddingVertical: space.md,
    borderTopWidth: 1,
    borderTopColor: color.border,
  },
  cta: {
    minHeight: target.primary,
    borderRadius: radius.md,
    backgroundColor: color.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaPressed: { opacity: 0.85 },
  ctaText: { ...type.action, color: color.brandText },
});
