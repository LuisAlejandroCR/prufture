// report/sent.tsx: closes the loop with a real celebration in the Alternative C completion style —
// scene, haptics, confetti, community progress and what was documented. No claim of final approval,
// no crypto words. Motion and confetti honor
// reduce-motion via src/feedback; the haptics always fire.

import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Animated, Dimensions, Easing, StyleSheet, Text, View } from "react-native";
import ConfettiCannon from "react-native-confetti-cannon";
import { assuranceFromProof, assuranceLabel, countsAsParticipantConfirmed, type Assurance } from "../../src/assurance";
import { savedReportCount } from "../../src/answer-tone";
import { Illustration } from "../../src/components/Illustration";
import { InfoCard, PrimaryButton, Screen, SecondaryButton } from "../../src/components/ui";
import { communityProgress } from "../../src/progress";
import { identityStepEnabled } from "../../src/flags";
import { MOMENT_SENT_MS, celebrationsAllowed, success, thud } from "../../src/feedback";
import { listProofs } from "../../src/queue";
import { getTask } from "../../src/tasks";
import { API_URL } from "../../src/useAutoSync";
import { color, space, type } from "../../src/theme";

const { width } = Dimensions.get("window");

export default function ReportSentScreen() {
  const { id, hash } = useLocalSearchParams<{ id: string; hash: string }>();
  const router = useRouter();
  const task = getTask(id ?? "");
  const progress = communityProgress(task);

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
        setSavedTotal(savedReportCount(rows) || null);
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
        <View style={styles.actions}>
          <View style={styles.flex}>
            <SecondaryButton
              label="View status"
              onPress={() =>
                rowId
                  ? router.replace({ pathname: "/status/[id]", params: { id: rowId } })
                  : router.replace("/updates")
              }
            />
          </View>
          <View style={styles.flex}>
            <PrimaryButton label="Done" onPress={() => router.replace("/(tabs)")} />
          </View>
        </View>
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

      <View style={styles.scene}>
        <Illustration scene="saved" height={170} />
      </View>

      <Animated.View style={[styles.hero, blockStyle]}>
        <Text style={styles.title} accessibilityRole="header">
          Report sent
        </Text>
        <Text style={styles.body}>Thank you. Your report is on its way to the programme team.</Text>
        {savedTotal && savedTotal > 0 ? (
          <Text style={styles.nudge}>
            That is {savedTotal === 1 ? "your first report" : `report ${savedTotal} from this phone`}.
          </Text>
        ) : null}
      </Animated.View>

      {progress ? (
        <InfoCard
          icon="community"
          tint={color.success}
          soft={color.successSoft}
          title={
            countsAsParticipantConfirmed(assurance) && count > 0
              ? `Confirmed by ${count} community ${count === 1 ? "member" : "members"}`
              : `Community progress: ${progress.have} of ${progress.need} confirmations`
          }
          body="More confirmations help build a clearer picture for the community."
        />
      ) : (
        <InfoCard
          icon="community"
          tint={color.success}
          soft={color.successSoft}
          title={
            countsAsParticipantConfirmed(assurance) && count > 0
              ? `Confirmed by ${count} community ${count === 1 ? "member" : "members"}`
              : "Waiting for another community report"
          }
        />
      )}

      <InfoCard icon="programme" title="You documented" body={task.title} tint={color.information} soft={color.informationSoft} />
      <InfoCard
        icon="privacy"
        title={assuranceLabel(assurance)}
        tint={assurance === "verified" ? color.success : color.muted}
        soft={assurance === "verified" ? color.successSoft : color.surfaceSoft}
      />
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
  nudge: { ...type.meta, color: color.muted },
});
