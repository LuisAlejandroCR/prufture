// (tabs)/me.tsx: essential settings only, not a social profile. Plain-language
// storage line, then rows for language, accessibility, data and privacy, offline
// storage, help, about. No wallet, no account address. Presentation over src/queue.

import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { QueuedProof } from "@proof/core";
import { Row, Screen, ScreenTitle, SectionLabel } from "../../src/components/ui";
import { listProofs } from "../../src/queue";
import { API_URL } from "../../src/useAutoSync";
import { color, radius, space, type } from "../../src/theme";

export default function MeScreen() {
  const router = useRouter();
  const [pending, setPending] = useState(0);
  const [confirmed, setConfirmed] = useState(0);
  const [activities, setActivities] = useState(0);

  useFocusEffect(
    useCallback(() => {
      listProofs()
        .then((rows: QueuedProof[]) => {
          setPending(rows.filter((r) => r.status === "pending_sync").length);
          setConfirmed(
            rows.filter((r) => r.status === "attested" || r.attestationCount > 0).length,
          );
          setActivities(new Set(rows.map((r) => r.taskId)).size);
        })
        .catch(() => {
          setPending(0);
          setConfirmed(0);
          setActivities(0);
        });
    }, []),
  );

  return (
    <Screen>
      <ScreenTitle>Me</ScreenTitle>

      <View style={styles.contribution}>
        <Text style={styles.contributionLabel}>Your contribution</Text>
        <Text style={styles.contributionText}>
          {confirmed} {confirmed === 1 ? "report" : "reports"} confirmed ·{" "}
          {activities} programme {activities === 1 ? "activity" : "activities"} supported
        </Text>
        <Text style={styles.contributionNote}>
          Only you see this. It is never linked to a public report.
        </Text>
      </View>

      <View style={styles.storage}>
        <Text style={styles.storageText}>
          {pending === 0
            ? "No reports are waiting to send."
            : `${pending} ${pending === 1 ? "report is" : "reports are"} waiting to send.`}
        </Text>
      </View>

      <View style={{ gap: space.sm }}>
        <SectionLabel>Settings</SectionLabel>
        <Row icon="language" title="Language" subtitle="English" onPress={() => undefined} />
        <Row
          icon="accessibility"
          title="Accessibility"
          subtitle="Text size follows your phone settings"
          onPress={() => undefined}
        />
        <Row
          icon="privacy"
          title="Data and privacy"
          subtitle="What we ask for and why"
          onPress={() => router.push("/help")}
        />
        <Row
          icon="offline"
          title="Offline storage"
          subtitle={pending === 0 ? "Nothing waiting" : `${pending} waiting to send`}
          onPress={() => router.push("/updates")}
        />
      </View>

      <View style={{ gap: space.sm }}>
        <SectionLabel>Support</SectionLabel>
        <Row icon="help" title="Help" subtitle="How the app works" onPress={() => router.push("/help")} />
        <Row icon="info" title="About Prufture" subtitle="Version and open-source notes" onPress={() => undefined} />
      </View>

      <Text style={styles.about}>
        Prufture keeps your reports on this phone until you have signal. Your identity and exact
        location are never part of a report.
      </Text>

      {__DEV__ ? (
        <Text style={styles.devLine} accessibilityLabel={`Development build. Server ${API_URL}`}>
          dev · server {API_URL}
        </Text>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  contribution: {
    padding: space.lg,
    borderRadius: radius.md,
    backgroundColor: color.primarySoft,
    gap: space.xs,
  },
  contributionLabel: { ...type.label, color: color.primary, textTransform: "uppercase" },
  contributionText: { ...type.subtitle, color: color.text },
  contributionNote: { ...type.meta, color: color.muted },
  storage: {
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: color.surfaceSoft,
  },
  storageText: { ...type.body, color: color.text, fontWeight: "600" },
  about: { ...type.meta, color: color.muted },
  devLine: { ...type.label, color: color.faint, marginTop: space.md, fontFamily: "monospace" },
});
