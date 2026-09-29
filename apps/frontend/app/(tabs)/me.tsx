// (tabs)/me.tsx: essential settings only, not a social profile — storage line, then language,
// accessibility, data and privacy, offline storage, help and about. No wallet, no account address.

import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { StyleSheet, Switch, Text, View } from "react-native";
import { Icon, type IconName } from "../../src/components/icons/Icon";
import { Illustration } from "../../src/components/Illustration";
import { BrandMark, Row, Screen, ScreenTitle, SectionLabel } from "../../src/components/ui";
import {
  hydrateFeedbackSettings,
  isCelebrationsEnabled,
  isHapticsEnabled,
  setCelebrationsEnabled,
  setHapticsEnabled,
} from "../../src/feedback";
import { confirmedReportCount } from "../../src/home";
import { listProofs } from "../../src/queue";
import { color, radius, space, target, type } from "../../src/theme";

export default function MeScreen() {
  const router = useRouter();
  const [pending, setPending] = useState(0);
  const [confirmed, setConfirmed] = useState(0);
  const [activities, setActivities] = useState(0);
  const [haptics, setHaptics] = useState(true);
  const [celebrations, setCelebrations] = useState(true);

  useFocusEffect(
    useCallback(() => {
      void hydrateFeedbackSettings().then(() => {
        setHaptics(isHapticsEnabled());
        setCelebrations(isCelebrationsEnabled());
      });
      listProofs()
        .then((rows) => {
          setPending(rows.filter((r) => r.status === "pending_sync").length);
          setConfirmed(confirmedReportCount(rows));
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
      <BrandMark />
      <ScreenTitle>Me</ScreenTitle>

      <View style={styles.contribution}>
        <Illustration scene="growth" height={96} />
        <View style={styles.contributionBody}>
          <Text style={styles.contributionLabel}>Your contribution</Text>
          <Text style={styles.contributionText}>
            {confirmed} {confirmed === 1 ? "report" : "reports"} confirmed ·{" "}
            {activities} programme {activities === 1 ? "activity" : "activities"} supported
          </Text>
          <Text style={styles.contributionNote}>
            No ranking. Every useful report counts. Only you see this.
          </Text>
        </View>
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
        <SectionLabel>Accessibility</SectionLabel>
        <Text style={styles.groupNote}>Text size follows your phone settings.</Text>
        <ToggleRow
          icon="accessibility"
          title="Haptics"
          subtitle="A short vibration on key actions"
          value={haptics}
          onValueChange={(v) => {
            setHaptics(v);
            void setHapticsEnabled(v);
          }}
        />
        <ToggleRow
          icon="review"
          title="Celebrations and motion"
          subtitle="Confetti and animations. Off also follows your phone reduce motion setting."
          value={celebrations}
          onValueChange={(v) => {
            setCelebrations(v);
            void setCelebrationsEnabled(v);
          }}
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

function ToggleRow({
  icon,
  title,
  subtitle,
  value,
  onValueChange,
}: {
  icon: IconName;
  title: string;
  subtitle: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.toggleRow}>
      <View style={styles.toggleIcon}>
        <Icon name={icon} size={20} color={color.text} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.toggleTitle}>{title}</Text>
        <Text style={styles.toggleSub}>{subtitle}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        accessibilityLabel={title}
        trackColor={{ false: color.border, true: color.primary }}
        thumbColor={color.surface}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  groupNote: { ...type.meta, color: color.muted },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
    minHeight: target.min + 12,
  },
  toggleIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: color.surfaceSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  toggleTitle: { ...type.subtitle, color: color.text },
  toggleSub: { ...type.meta, color: color.muted },
  contribution: {
    borderRadius: radius.md,
    overflow: "hidden",
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
  },
  contributionBody: { padding: space.md, gap: space.xs },
  contributionLabel: { ...type.meta, color: color.muted, fontWeight: "700" },
  contributionText: { ...type.subtitle, color: color.text },
  contributionNote: { ...type.meta, color: color.muted },
  storage: {
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: color.surfaceSoft,
  },
  storageText: { ...type.body, color: color.text, fontWeight: "600" },
  about: { ...type.meta, color: color.muted },
});
