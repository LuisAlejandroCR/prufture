// report/saved.tsx: offline-saved is a success, never a failure — a calm 2s moment (haptic, card
// settles, lock icon) then two actions. If the phone already has signal, move straight to Sending.

import NetInfo from "@react-native-community/netinfo";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import { Icon } from "../../src/components/icons/Icon";
import { PrimaryButton, Screen, SecondaryButton } from "../../src/components/ui";
import { MOMENT_SAVED_MS, celebrationsAllowed, success } from "../../src/feedback";
import { color, radius, space, type } from "../../src/theme";

export default function ReportSavedScreen() {
  const { id, hash, count } = useLocalSearchParams<{ id: string; hash: string; count: string }>();
  const router = useRouter();
  const n = Number(count ?? "1") || 1;

  const card = useRef(new Animated.Value(0)).current;
  const lock = useRef(new Animated.Value(0)).current;
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
        lock.setValue(1);
        actions.setValue(1);
        return;
      }
      Animated.parallel([
        Animated.timing(card, {
          toValue: 1,
          duration: MOMENT_SAVED_MS,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(lock, {
          toValue: 1,
          duration: MOMENT_SAVED_MS,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start(() => {
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
  }, [card, lock, actions]);

  const cardStyle = {
    opacity: card,
    transform: [{ translateY: card.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
  };
  const lockStyle = {
    opacity: lock,
    transform: [{ scale: lock.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) }],
  };

  return (
    <Screen
      footer={
        <Animated.View style={{ opacity: actions, gap: space.sm }}>
          <PrimaryButton label="Done" onPress={() => router.replace("/(tabs)")} />
          <SecondaryButton label="View waiting reports" onPress={() => router.replace("/updates")} />
        </Animated.View>
      }
    >
      <Animated.View style={[styles.hero, cardStyle]}>
        <View style={styles.badge}>
          <Icon name="check" size={40} color={color.success} />
          <Animated.View style={[styles.lock, lockStyle]}>
            <Icon name="privacy" size={16} color={color.onPrimary} />
          </Animated.View>
        </View>
        <Text style={styles.title} accessibilityRole="header">
          Report saved
        </Text>
        <Text style={styles.body}>
          {n > 1 ? `${n} photos are saved on this phone. ` : "It is saved on this phone. "}
          It will send automatically when you have signal.
        </Text>
      </Animated.View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: "center", gap: space.md, paddingVertical: space.xxl },
  badge: {
    width: 88,
    height: 88,
    borderRadius: radius.pill,
    backgroundColor: color.successSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  lock: {
    position: "absolute",
    right: 4,
    bottom: 4,
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    backgroundColor: color.success,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { ...type.display, color: color.text },
  body: { ...type.body, color: color.muted, textAlign: "center" },
});
