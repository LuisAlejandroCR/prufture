// report/sending.tsx: progress without implying the reporter must wait here. Runs the sync once, then
// moves to Sent on success or shows a calm "safe on this phone" state offline, in the Alternative C
// completion style (scene, title, info card, side-by-side actions). No chain language.

import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Illustration } from "../../src/components/Illustration";
import { InfoCard, PrimaryButton, Screen, SecondaryButton } from "../../src/components/ui";
import { listProofs } from "../../src/queue";
import { runPendingSync } from "../../src/useAutoSync";
import { color, space, type } from "../../src/theme";

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

  const scene = (
    <View style={styles.scene}>
      <Illustration scene="saved" height={180} />
    </View>
  );

  if (phase === "waiting") {
    return (
      <Screen
        footer={
          <View style={styles.actions}>
            <View style={styles.flex}>
              <SecondaryButton label="My reports" onPress={() => router.replace("/updates")} />
            </View>
            <View style={styles.flex}>
              <PrimaryButton label="Done" onPress={() => router.replace("/(tabs)")} />
            </View>
          </View>
        }
      >
        {scene}
        <View style={styles.hero}>
          <Text style={styles.title} accessibilityRole="header">
            Report saved safely
          </Text>
          <Text style={styles.body}>The signal dropped before it could send. Your report is saved on this phone.</Text>
        </View>
        <InfoCard
          icon="offline"
          title="Waiting for signal"
          body="No problem. It will send itself as soon as you have a connection."
        />
      </Screen>
    );
  }

  return (
    <Screen>
      {scene}
      <View style={styles.hero}>
        <ActivityIndicator size="large" color={color.primary} />
        <Text style={styles.title} accessibilityRole="header">
          {phase === "sent" ? "Report sent" : "Sending report"}
        </Text>
        <Text style={styles.body}>
          {phase === "sent" ? "One moment..." : "You can keep using the app while this finishes."}
        </Text>
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
});
