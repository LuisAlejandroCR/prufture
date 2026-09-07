// report/sending.tsx: progress without implying the reporter must wait here.
// Runs the existing sync once, then reads the queue for this report. On success it
// moves to the Sent screen; with no signal it shows a calm "safe on this phone"
// state. No transaction or chain language. Presentation over src/useAutoSync + src/queue.

import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Icon } from "../../src/components/icons/Icon";
import { PrimaryButton, Screen, SecondaryButton } from "../../src/components/ui";
import { listProofs } from "../../src/queue";
import { runPendingSync } from "../../src/useAutoSync";
import { color, radius, space, type } from "../../src/theme";

type Phase = "sending" | "waiting" | "sent";

export default function ReportSendingScreen() {
  const { id, hash } = useLocalSearchParams<{ id: string; hash: string }>();
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("sending");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await runPendingSync().catch(() => undefined);
      if (cancelled) return;
      const rows = await listProofs().catch(() => []);
      const mine = hash ? rows.find((r) => r.proofHash === hash) : rows[0];
      if (cancelled) return;
      if (mine && mine.status !== "pending_sync") {
        setPhase("sent");
        setTimeout(() => {
          if (!cancelled) router.replace({ pathname: "/report/sent", params: { id: id ?? "", hash: hash ?? "" } });
        }, 700);
      } else {
        setPhase("waiting");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, hash, router]);

  if (phase === "waiting") {
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
          <View style={[styles.badge, { backgroundColor: color.warningSoft }]}>
            <Icon name="offline" size={36} color={color.warning} />
          </View>
          <Text style={styles.title} accessibilityRole="header">
            Waiting for signal
          </Text>
          <Text style={styles.body}>
            Your report is safe on this phone. It will send itself as soon as you have a connection.
          </Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.hero}>
        <ActivityIndicator size="large" color={color.primary} />
        <Text style={styles.title} accessibilityRole="header">
          {phase === "sent" ? "Report sent" : "Sending report"}
        </Text>
        <Text style={styles.body}>
          {phase === "sent" ? "One moment..." : "You can continue using the app while this finishes."}
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
    alignItems: "center",
    justifyContent: "center",
  },
  title: { ...type.display, color: color.text },
  body: { ...type.body, color: color.muted, textAlign: "center" },
});
