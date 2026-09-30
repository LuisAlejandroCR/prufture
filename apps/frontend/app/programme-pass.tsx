// programme-pass.tsx: the programme pass, opened from Me when this build has it on. Whether this phone
// is on the programme list, how a reporter joins (in person, the coordinator adds the code), and the
// code itself, selectable so it can be read out or copied. Me keeps only the one-line status.

import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { BackLink, Screen, ScreenTitle } from "../src/components/ui";
import { getCommitment, getEnrolment } from "../src/personhood-device";
import type { Enrolment } from "../src/personhood-proof";
import { API_URL } from "../src/useAutoSync";
import { color, radius, space, type } from "../src/theme";

export default function ProgrammePassScreen() {
  const router = useRouter();
  const [passCode, setPassCode] = useState<string | null>(null);
  const [passError, setPassError] = useState(false);
  const [enrolment, setEnrolment] = useState<Enrolment>("unknown");

  useFocusEffect(
    useCallback(() => {
      getCommitment()
        .then((c) => {
          setPassCode(c);
          setPassError(false);
        })
        .catch(() => setPassError(true));
      getEnrolment(API_URL)
        .then(setEnrolment)
        .catch(() => setEnrolment("unknown"));
    }, []),
  );

  return (
    <Screen>
      <BackLink label="Me" onPress={() => router.back()} />
      <ScreenTitle>Programme pass</ScreenTitle>

      <View style={styles.status}>
        <Text style={styles.statusText}>{ENROLMENT_LINE[enrolment]}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Your code</Text>
        <Text
          style={styles.code}
          selectable
          accessibilityLabel={passCode ? `Programme pass code. ${passCode}` : "Programme pass code not ready"}
        >
          {passCode ?? (passError ? "Could not load the code. Open this screen again." : "Preparing code…")}
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>How to join</Text>
        <Text style={styles.body}>
          To join, meet your programme coordinator in person and show them the code above.
          They add it to the programme list. You only do this once on this phone. A new phone
          or a reinstall gives a new code, so show that one too.
        </Text>
        <Text style={styles.body}>
          After that, each report you send includes a check that it came from someone on the list. The
          check does not send this code, your name, your phone number or your location. Your
          coordinator knows this code is yours.
        </Text>
      </View>
    </Screen>
  );
}

const ENROLMENT_LINE: Record<Enrolment, string> = {
  enrolled: "This phone is on the programme list.",
  not_enrolled: "This phone is not on the programme list yet.",
  unknown: "Could not check the programme list right now.",
};

const styles = StyleSheet.create({
  status: { padding: space.md, borderRadius: radius.md, backgroundColor: color.surfaceSoft },
  statusText: { ...type.body, color: color.text, fontWeight: "600" },
  card: {
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
  },
  label: { ...type.meta, color: color.muted, fontWeight: "700" },
  code: { ...type.body, color: color.text, fontWeight: "600", fontVariant: ["tabular-nums"] },
  body: { ...type.meta, color: color.muted },
});
