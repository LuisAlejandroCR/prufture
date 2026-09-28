// report/saved.tsx: offline-saved is a success, never a failure (Alternative C, screen 3). A calm 2s
// moment (haptic, card settles) over the sun-and-sprout scene, community progress for assignments,
// a friendly offline card, then View status / Done. If the phone has signal, move straight to Sending.

import NetInfo from "@react-native-community/netinfo";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import { Icon } from "../../src/components/icons/Icon";
import { Illustration } from "../../src/components/Illustration";
import { PrimaryButton, Screen, SecondaryButton } from "../../src/components/ui";
import { MOMENT_SAVED_MS, celebrationsAllowed, success } from "../../src/feedback";
import { communityProgress } from "../../src/progress";
import { getTask } from "../../src/tasks";
import { color, radius, space, type } from "../../src/theme";

export default function ReportSavedScreen() {
  const { id, hash, count } = useLocalSearchParams<{ id: string; hash: string; count: string }>();
  const router = useRouter();
  const n = Number(count ?? "1") || 1;
  const progress = communityProgress(getTask(id ?? ""));

  const card = useRef(new Animated.Value(0)).current;
  const actions = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let cancelled = false;
    NetInfo.fetch()
      .then((s) => {
        if (!cancelled && s.isConnected && s.isInternetReachable !== false) {
          router.replace({ pathname: "/report/sending", params: { id: id ?? "", hash: hash ?? "" } });
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [id, hash, router]);

  useEffect(() => {
    let cancelled = false;
    void success();
    void celebrationsAllowed().then((allowed) => {
      if (cancelled) return;
      if (!allowed) {
        card.setValue(1);
        actions.setValue(1);
        return;
      }
      Animated.timing(card, {
        toValue: 1,
        duration: MOMENT_SAVED_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(() => {
        if (!cancelled) {
          Animated.timing(actions, {
            toValue: 1,
            duration: 220,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }).start();
        }
      });
    });
    return () => {
      cancelled = true;
    };
  }, [card, actions]);

  const cardStyle = {
    opacity: card,
    transform: [{ translateY: card.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
  };

  return (
    <Screen
      footer={
        <Animated.View style={[styles.actions, { opacity: actions }]}>
          <View style={styles.flex}>
            <SecondaryButton
              label="View status"
              onPress={() =>
                hash
                  ? router.replace({ pathname: "/status/[id]", params: { id: hash } })
                  : router.replace("/updates")
              }
            />
          </View>
          <View style={styles.flex}>
            <PrimaryButton label="Done" onPress={() => router.replace("/(tabs)")} />
          </View>
        </Animated.View>
      }
    >
      <View style={styles.scene}>
        <Illustration scene="saved" height={180} />
      </View>

      <Animated.View style={[styles.hero, cardStyle]}>
        <Text style={styles.title} accessibilityRole="header">
          Report saved safely
        </Text>
        <Text style={styles.body}>
          {n > 1 ? `Your report and its ${n} photos are ` : "Your report is "}
          saved on this phone and will send automatically when you are online.
        </Text>
      </Animated.View>

      {progress ? (
        <View
          style={styles.progress}
          accessibilityRole="text"
          accessibilityLabel={`Community progress. ${progress.have} of ${progress.need} confirmations.`}
        >
          <View style={styles.progressHead}>
            <Icon name="community" size={28} color={color.success} />
            <View style={styles.flex}>
              <Text style={styles.progressLabel}>Community progress</Text>
              <Text style={styles.progressValue}>
                {progress.have} of {progress.need} confirmations
              </Text>
            </View>
          </View>
          <View style={styles.segments}>
            {Array.from({ length: progress.need }, (_, i) => (
              <View key={i} style={[styles.segment, i < progress.have && styles.segmentOn]} />
            ))}
          </View>
          <Text style={styles.progressNote}>More confirmations help build a clearer picture for the community.</Text>
        </View>
      ) : null}

      <View style={styles.offline} accessibilityRole="text">
        <Icon name="offline" size={22} color={color.primary} />
        <View style={styles.flex}>
          <Text style={styles.offlineTitle}>You are offline</Text>
          <Text style={styles.offlineBody}>
            No problem. Your report is saved and will sync automatically when you are back online.
          </Text>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  actions: { flexDirection: "row", gap: space.sm },
  scene: { marginHorizontal: -space.lg, marginTop: -space.lg },
  hero: { alignItems: "center", gap: space.sm },
  title: { ...type.display, color: color.text, textAlign: "center" },
  body: { ...type.body, color: color.muted, textAlign: "center" },
  progress: { gap: space.sm, padding: space.lg, borderRadius: radius.md, backgroundColor: color.successSoft },
  progressHead: { flexDirection: "row", alignItems: "center", gap: space.md },
  progressLabel: { ...type.meta, color: color.text },
  progressValue: { ...type.title, color: color.text },
  segments: { flexDirection: "row", gap: space.xs },
  segment: { flex: 1, height: 8, borderRadius: radius.pill, backgroundColor: color.border },
  segmentOn: { backgroundColor: color.success },
  progressNote: { ...type.meta, color: color.muted },
  offline: {
    flexDirection: "row",
    gap: space.md,
    alignItems: "flex-start",
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
  },
  offlineTitle: { ...type.subtitle, color: color.text },
  offlineBody: { ...type.meta, color: color.muted },
});
