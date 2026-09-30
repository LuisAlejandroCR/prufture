// (tabs)/me.tsx: essential settings only, not a social profile. One contribution line, then short
// rows that each open their own screen: the optional checks (face check, programme pass), settings
// (data and privacy, offline storage, accessibility), coordinator review and support. No long copy
// here: the pass explanation and code, and the accessibility switches, live on their screens.

import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { BrandMark, Row, Screen, ScreenTitle, SectionLabel } from "../../src/components/ui";
import { loadLivenessPass, passUntilLabel } from "../../src/face-liveness";
import { livenessProvider, personhoodProvider } from "../../src/flags";
import { confirmedReportCount } from "../../src/home";
import { openInApp, siteUrl } from "../../src/links";
import { getEnrolment } from "../../src/personhood-device";
import type { Enrolment } from "../../src/personhood-proof";
import { listProofs } from "../../src/queue";
import { API_URL } from "../../src/useAutoSync";
import { color, radius, space, type } from "../../src/theme";

export default function MeScreen() {
  const router = useRouter();
  const [pending, setPending] = useState(0);
  const [confirmed, setConfirmed] = useState(0);
  const [activities, setActivities] = useState(0);
  const passOn = personhoodProvider() === "semaphore";
  const [enrolment, setEnrolment] = useState<Enrolment>("unknown");
  const faceCheckOn = livenessProvider() === "aws";
  const [faceCheckUntil, setFaceCheckUntil] = useState<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (passOn) {
        getEnrolment(API_URL)
          .then(setEnrolment)
          .catch(() => setEnrolment("unknown"));
      }
      if (faceCheckOn) void loadLivenessPass().then((p) => setFaceCheckUntil(p?.usableUntil ?? null));
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

      <View style={styles.contribution} accessible>
        <Text style={styles.contributionText}>
          {confirmed} {confirmed === 1 ? "report" : "reports"} confirmed · {activities}{" "}
          {activities === 1 ? "activity" : "activities"} supported
        </Text>
        <Text style={styles.contributionNote}>No ranking. Only you see this.</Text>
      </View>

      {faceCheckOn || passOn ? (
        <View style={{ gap: space.sm }}>
          <SectionLabel>Your checks</SectionLabel>
          {faceCheckOn ? (
            <Row
              icon="shield"
              title="Face check"
              subtitle={faceCheckUntil ? `Done until ${passUntilLabel(faceCheckUntil)}` : "Optional, once. Not needed to report"}
              onPress={() => router.push("/face-check")}
            />
          ) : null}
          {passOn ? (
            <Row
              icon="programme"
              title="Programme pass"
              subtitle={PASS_SUBTITLE[enrolment]}
              onPress={() => router.push("/programme-pass")}
            />
          ) : null}
        </View>
      ) : null}

      <View style={{ gap: space.sm }}>
        <SectionLabel>Settings</SectionLabel>
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
        <Row
          icon="accessibility"
          title="Accessibility"
          subtitle="Haptics and motion"
          onPress={() => router.push("/accessibility")}
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
        <Row icon="help" title="Help" onPress={() => router.push("/help")} />
        <Row icon="community" title="Contact support" onPress={() => router.push("/support")} />
        <Row icon="privacy" title="Privacy policy" onPress={() => void openInApp(siteUrl("privacy"))} />
        <Row icon="info" title="About Prufture" subtitle="Version" onPress={() => router.push("/about")} />
      </View>
    </Screen>
  );
}

const PASS_SUBTITLE: Record<Enrolment, string> = {
  enrolled: "On the programme list",
  not_enrolled: "Not on the list yet. Show your code to a coordinator",
  unknown: "Show your code to a coordinator",
};

const styles = StyleSheet.create({
  contribution: {
    gap: space.xs,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
  },
  contributionText: { ...type.subtitle, color: color.text },
  contributionNote: { ...type.meta, color: color.muted },
});
