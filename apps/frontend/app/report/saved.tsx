// report/saved.tsx: offline-saved is a success, never a failure. Strong success
// state, then two calm actions. If the phone already has signal, move straight to
// the Sending screen. Presentation over @react-native-community/netinfo.

import NetInfo from "@react-native-community/netinfo";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Icon } from "../../src/components/icons/Icon";
import { PrimaryButton, Screen, SecondaryButton } from "../../src/components/ui";
import { color, radius, space, type } from "../../src/theme";

export default function ReportSavedScreen() {
  const { id, hash, count } = useLocalSearchParams<{ id: string; hash: string; count: string }>();
  const router = useRouter();
  const n = Number(count ?? "1") || 1;

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

  return (
    <Screen
      footer={
        <>
          <PrimaryButton label="Done" onPress={() => router.replace("/(tabs)")} />
          <SecondaryButton label="View waiting reports" onPress={() => router.replace("/updates")} />
        </>
      }
    >
      <View style={styles.hero}>
        <View style={styles.badge}>
          <Icon name="check" size={40} color={color.success} />
        </View>
        <Text style={styles.title} accessibilityRole="header">
          Report saved
        </Text>
        <Text style={styles.body}>
          {n > 1 ? `${n} photos are saved on this phone. ` : "It is saved on this phone. "}
          It will send automatically when you have signal.
        </Text>
      </View>
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
  title: { ...type.display, color: color.text },
  body: { ...type.body, color: color.muted, textAlign: "center" },
});
