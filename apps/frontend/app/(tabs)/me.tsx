// (tabs)/me.tsx: essential settings only, not a social profile — storage line, then language,
// accessibility, data and privacy, offline storage, the programme pass (how to join in person, and
// whether this phone is on the list), coordinator review, help and about. No wallet, no account address.

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
import { loadLivenessPass, passUntilLabel } from "../../src/face-liveness";
import { livenessProvider, personhoodProvider } from "../../src/flags";
import { confirmedReportCount } from "../../src/home";
import { openInApp, siteUrl } from "../../src/links";
import { getCommitment, getEnrolment } from "../../src/personhood-device";
import type { Enrolment } from "../../src/personhood-proof";
import { listProofs } from "../../src/queue";
import { API_URL } from "../../src/useAutoSync";
import { color, radius, space, target, type } from "../../src/theme";

export default function MeScreen() {
  const router = useRouter();
  const [pending, setPending] = useState(0);
  const [confirmed, setConfirmed] = useState(0);
  const [activities, setActivities] = useState(0);
  const [haptics, setHaptics] = useState(true);
  const [celebrations, setCelebrations] = useState(true);
  const passOn = personhoodProvider() === "semaphore";
  const [passCode, setPassCode] = useState<string | null>(null);
  const [passError, setPassError] = useState(false);
  const [enrolment, setEnrolment] = useState<Enrolment>("unknown");
  const faceCheckOn = livenessProvider() === "aws";
  const [faceCheckUntil, setFaceCheckUntil] = useState<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (passOn) {
        getCommitment()
          .then((c) => {
            setPassCode(c);
            setPassError(false);
          })
          .catch(() => setPassError(true));
        getEnrolment(API_URL)
          .then(setEnrolment)
          .catch(() => setEnrolment("unknown"));
      }
      if (faceCheckOn) void loadLivenessPass().then((p) => setFaceCheckUntil(p?.usableUntil ?? null));
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
    }, [passOn, faceCheckOn]),
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
        <View style={styles.valueRow} accessible accessibilityLabel="Language. English">
          <View style={styles.toggleIcon}><Icon name="language" size={20} color={color.text} /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.toggleTitle}>Language</Text>
            <Text style={styles.toggleSub}>English</Text>
          </View>
        </View>
        <Row
          icon="privacy"
          title="Data and privacy"
          subtitle="What we ask for and why"
          onPress={() => router.push("/data-privacy")}
        />
        <Row
          icon="offline"
          title="Offline storage"
          subtitle={pending === 0 ? "Nothing waiting" : `${pending} waiting to send`}
          onPress={() => router.push("/updates")}
        />
        {faceCheckOn ? (
          <Row
            icon="shield"
            title="Face check"
            subtitle={faceCheckUntil ? `Done until ${passUntilLabel(faceCheckUntil)}` : "Optional, once. Not needed to report"}
            onPress={() => router.push("/face-check")}
          />
        ) : null}
        {passOn ? (
          <View style={styles.passRow}>
            <View style={styles.toggleIcon}><Icon name="programme" size={20} color={color.text} /></View>
            <View style={{ flex: 1, gap: space.xs }}>
              <Text style={styles.toggleTitle}>Programme pass</Text>
              <Text style={styles.toggleSub}>{ENROLMENT_LINE[enrolment]}</Text>
              <Text style={styles.toggleSub}>
                To join, meet your programme coordinator in person and show them the code below.
                They add it to the programme list. You only do this once on this phone. A new phone
                or a reinstall gives a new code, so show that one too.
              </Text>
              <Text style={styles.toggleSub}>
                After that, each report you send includes a check that it came from someone on the
                list. The check does not send this code, your name, your phone number or your
                location. Your coordinator knows this code is yours.
              </Text>
              <Text
                style={styles.passCode}
                selectable
                accessibilityLabel={
                  passCode ? `Programme pass code. ${passCode}` : "Programme pass code not ready"
                }
              >
                {passCode ?? (passError ? "Could not load the code. Open this screen again." : "Preparing code…")}
              </Text>
            </View>
          </View>
        ) : null}
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
        <SectionLabel>For coordinators</SectionLabel>
        <Row
          icon="programme"
          title="Coordinator review"
          subtitle="Check and export your programme's reports"
          onPress={() => router.push("/coordinator")}
        />
      </View>

      <View style={{ gap: space.sm }}>
        <SectionLabel>Support</SectionLabel>
        <Row icon="help" title="Help" subtitle="How the app works" onPress={() => router.push("/help")} />
        <Row icon="info" title="About Prufture" subtitle="Version" onPress={() => router.push("/about")} />
        <Row icon="privacy" title="Privacy policy" subtitle="Opens inside the app" onPress={() => void openInApp(siteUrl("privacy"))} />
        <Row icon="community" title="Contact support" subtitle="Get the right next step" onPress={() => router.push("/support")} />
      </View>

      <Text style={styles.about}>
        Prufture keeps your reports on this phone until you have signal. Your identity and exact
        location are never part of a report.
      </Text>
    </Screen>
  );
}

const ENROLMENT_LINE: Record<Enrolment, string> = {
  enrolled: "This phone is on the programme list.",
  not_enrolled: "This phone is not on the programme list yet.",
  unknown: "Could not check the programme list right now.",
};

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
  valueRow: {
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
  passRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space.md,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
  },
  passCode: { ...type.body, color: color.text, fontWeight: "600", fontVariant: ["tabular-nums"] },
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
