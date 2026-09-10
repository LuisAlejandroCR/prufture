// report/sent.tsx: close the loop with a real celebration. Success + thud haptics,
// a top-center confetti burst, and a congratulations block that names what the
// reporter helped document. No claim of final approval, no crypto words. Motion and
// confetti honor reduce-motion via src/feedback; the haptics always fire.
// Presentation over src/queue + src/feedback (reads the confirmation count only).

import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Animated, Dimensions, Easing, StyleSheet, Text, View } from "react-native";
import ConfettiCannon from "react-native-confetti-cannon";
import { assuranceFromProof, assuranceLabel, countsAsParticipantConfirmed, type Assurance } from "../../src/assurance";
import { Icon } from "../../src/components/icons/Icon";
import { PrimaryButton, Screen, SecondaryButton } from "../../src/components/ui";
import { identityStepEnabled } from "../../src/flags";
import { MOMENT_SENT_MS, celebrationsAllowed, success, thud } from "../../src/feedback";
import { listProofs } from "../../src/queue";
import { getTask } from "../../src/tasks";
import { API_URL } from "../../src/useAutoSync";
import { color, radius, space, type } from "../../src/theme";

const { width } = Dimensions.get("window");

export default function ReportSentScreen() {
  const { id, hash } = useLocalSearchParams<{ id: string; hash: string }>();
  const router = useRouter();
  const task = getTask(id ?? "");

  const [rowId, setRowId] = useState<string | null>(null);
  const [count, setCount] = useState(0);
  const [savedTotal, setSavedTotal] = useState<number | null>(null);
  const [assurance, setAssurance] = useState<Assurance>(identityStepEnabled() ? "unavailable" : "not_enrolled");
  const [celebrate, setCelebrate] = useState<boolean | null>(null);

  const block = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    listProofs()
      .then((rows) => {
        const mine = hash ? rows.find((r) => r.proofHash === hash) : rows[0];
        if (mine) {
          setRowId(mine.id);
          setCount(mine.attestationCount);
        }
        setSavedTotal(rows.length || null);
      })
      .catch(() => undefined);
  }, [hash]);

  useEffect(() => {
    if (!hash) return;
    let cancelled = false;
    fetch(`${API_URL.replace(/\/+$/, "")}/proof/${encodeURIComponent(hash)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { verifiedPerson?: unknown; verifiedPersonDegraded?: unknown } | null) => {
        if (cancelled || !data) return;
        setAssurance(
          assuranceFromProof(
            {
              verifiedPerson: typeof data.verifiedPerson === "boolean" ? data.verifiedPerson : null,
              verifiedPersonDegraded:
                typeof data.verifiedPersonDegraded === "boolean" ? data.verifiedPersonDegraded : null,
            },
            identityStepEnabled(),
          ),
        );
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [hash]);

  useEffect(() => {
    let cancelled = false;
    void success();
    const t = setTimeout(() => void thud(), 150);
    void celebrationsAllowed().then((allowed) => {
      if (cancelled) return;
      setCelebrate(allowed);
      if (!allowed) {
        block.setValue(1);
        return;
      }
      Animated.timing(block, {
        toValue: 1,
        duration: 420,
        delay: 180,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    });
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [block]);

  const blockStyle = {
    opacity: block,
    transform: [{ translateY: block.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
  };

  return (
    <Screen
      footer={
        <>
          <PrimaryButton label="Done" onPress={() => router.replace("/(tabs)")} />
          <SecondaryButton
            label="View status"
            onPress={() =>
              rowId
                ? router.replace({ pathname: "/status/[id]", params: { id: rowId } })
                : router.replace("/updates")
            }
          />
        </>
      }
    >
      {celebrate ? (
        <ConfettiCannon
          count={90}
          origin={{ x: width / 2, y: -12 }}
          autoStart
          fadeOut
          fallSpeed={MOMENT_SENT_MS}
          explosionSpeed={320}
          colors={[color.primary, color.success, color.warning, color.information]}
        />
      ) : null}

      <Animated.View style={[styles.hero, blockStyle]}>
        <View style={styles.badge}>
          <Icon name="check" size={40} color={color.information} />
        </View>
        <Text style={styles.title} accessibilityRole="header">
          Thank you, reporter
        </Text>
        <Text style={styles.body}>Your report is on its way to the programme team.</Text>

        <View style={styles.outcome}>
          <Icon name="programme" size={16} color={color.muted} />
          <Text style={styles.outcomeText}>You helped document: {task.title}</Text>
        </View>

        <View style={styles.outcome}>
          <Icon name="privacy" size={16} color={assurance === "verified" ? color.success : color.muted} />
          <Text
            style={[styles.outcomeText, assurance === "verified" && { color: color.success }]}
          >
            {assuranceLabel(assurance)}
          </Text>
        </View>

        <View style={styles.communityLine}>
          <Icon name="community" size={16} color={color.muted} />
          <Text style={styles.community}>
            {countsAsParticipantConfirmed(assurance) && count > 0
              ? `Confirmed by ${count} community ${count === 1 ? "member" : "members"}`
              : "Waiting for another community report"}
          </Text>
        </View>

        {savedTotal && savedTotal > 0 ? (
          <Text style={styles.nudge}>
            That is report #{savedTotal} you have saved.
          </Text>
        ) : null}
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
    backgroundColor: color.informationSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { ...type.display, color: color.text },
  body: { ...type.body, color: color.muted, textAlign: "center" },
  outcome: { flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: space.xs },
  outcomeText: { ...type.meta, color: color.text, fontWeight: "600", flexShrink: 1, textAlign: "center" },
  communityLine: { flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: space.sm },
  community: { ...type.meta, color: color.muted, fontWeight: "600" },
  nudge: { ...type.meta, color: color.muted },
});
