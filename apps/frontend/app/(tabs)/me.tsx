// (tabs)/me.tsx: essential settings only, not a social profile. Plain-language
// storage line, then rows for language, accessibility, data and privacy, offline
// storage, help, about. No wallet, no account address. Presentation over src/queue.

import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { QueuedProof } from "@proof/core";
import { Row, Screen, ScreenTitle, SectionLabel } from "../../src/components/ui";
import { listProofs } from "../../src/queue";
import { color, space, type } from "../../src/theme";

export default function MeScreen() {
  const router = useRouter();
  const [pending, setPending] = useState(0);

  useFocusEffect(
    useCallback(() => {
      listProofs()
        .then((rows: QueuedProof[]) => setPending(rows.filter((r) => r.status === "pending_sync").length))
        .catch(() => setPending(0));
    }, []),
  );

  return (
    <Screen>
      <ScreenTitle>Me</ScreenTitle>

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
    </Screen>
  );
}

const styles = StyleSheet.create({
  storage: {
    padding: space.md,
    borderRadius: 14,
    backgroundColor: color.surfaceSoft,
  },
  storageText: { ...type.body, color: color.text, fontWeight: "600" },
  about: { ...type.meta, color: color.faint },
});
