// report/identity.tsx: optional selfie liveness step — three randomized gestures, one small frame each.
// Frames leave the device once (POST /verify-identity) and are never stored; only booleans reach the
// draft. Provider down or unconfigured degrades to "could not confirm" with Continue anyway.

import { CameraView, useCameraPermissions } from "expo-camera";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { Icon } from "../../src/components/icons/Icon";
import {
  BackLink,
  DraftLoading,
  Notice,
  PrimaryButton,
  ReportProgress,
  Screen,
} from "../../src/components/ui";
import { runLiveness, submitLiveness, type Gesture } from "../../src/liveness";
import { ensureDraft, setLiveness } from "../../src/report-draft";
import { getTask } from "../../src/tasks";
import { useDraftReady } from "../../src/useDraftReady";
import { color, radius, space, type } from "../../src/theme";

// Duplicates src/feedback MOMENT_IDENTITY_MS, inlined before that constant existed; switch to the
// shared constant + haptics.
const MOMENT_IDENTITY_MS = 1500;

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8787";

const GESTURE_COPY: Record<Gesture, { label: string; glyph: string }> = {
  center: { label: "Look straight at the camera", glyph: "●" },
  left: { label: "Slowly turn your head left", glyph: "←" },
  right: { label: "Slowly turn your head right", glyph: "→" },
  blink: { label: "Blink twice", glyph: "◡" },
};

type Phase = "intro" | "running" | "checking" | "verified" | "degraded";

function ReportIdentityBody() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const task = getTask(id ?? "");
  ensureDraft(task.id);

  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [phase, setPhase] = useState<Phase>("intro");
  const [step, setStep] = useState<{ gesture: Gesture; index: number; total: number } | null>(null);
  const badge = useMemo(() => new Animated.Value(0), []);

  const advance = () => router.replace({ pathname: "/report/capture", params: { id: task.id, step: "0" } });

  useEffect(() => {
    if (phase !== "verified") return;
    Animated.spring(badge, { toValue: 1, useNativeDriver: true, friction: 5 }).start();
    const t = setTimeout(advance, MOMENT_IDENTITY_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  async function takeFrame(): Promise<string | null> {
    try {
      const photo = await cameraRef.current?.takePictureAsync({ quality: 0.3, base64: true });
      return photo?.base64 ?? null;
    } catch {
      return null;
    }
  }

  async function start() {
    setPhase("running");
    const result = await runLiveness({
      takeFrame,
      onStep: (gesture, index, total) => setStep({ gesture, index, total }),
    });
    setPhase("checking");
    const verdict = await submitLiveness(API_URL, result);
    setLiveness(true, verdict.verifiedPerson, verdict.degraded, verdict.ticket);
    setPhase(verdict.verifiedPerson ? "verified" : "degraded");
  }

  if (!permission) {
    return (
      <Screen>
        <BackLink label="Back" onPress={() => router.back()} />
        <Text style={styles.muted}>Getting the camera ready...</Text>
      </Screen>
    );
  }

  if (!permission.granted) {
    return (
      <Screen footer={<PrimaryButton label="Allow camera" onPress={requestPermission} />}>
        <BackLink label="Back" onPress={() => router.back()} />
        <ReportProgress step={1} label="Identity" />
        <Text style={styles.title}>A quick selfie check</Text>
        <Text style={styles.muted}>
          The camera is needed for a short liveness check. Your face is not stored and nothing about
          you is signed or put on-chain.
        </Text>
      </Screen>
    );
  }

  if (phase === "verified") {
    return (
      <Screen>
        <ReportProgress step={1} label="Identity" />
        <View style={styles.center}>
          <Animated.View style={[styles.badge, { transform: [{ scale: badge }] }]}>
            <Icon name="check" size={44} color={color.success} />
          </Animated.View>
          <Text style={styles.title}>You're verified</Text>
          <Text style={styles.muted}>A live person was confirmed for this report.</Text>
        </View>
      </Screen>
    );
  }

  if (phase === "degraded") {
    return (
      <Screen footer={<PrimaryButton label="Continue anyway" onPress={advance} />}>
        <ReportProgress step={1} label="Identity" />
        <Text style={styles.title}>Could not confirm a live person</Text>
        <Notice tone="warning" icon="warning">
          We could not confirm a live person right now. You can still submit; the report will be
          marked unverified.
        </Notice>
      </Screen>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.top}>
        <BackLink label="Back" onPress={() => router.back()} />
      </View>

      <View style={styles.viewport}>
        <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="front" />
        {phase === "running" && step ? (
          <View style={styles.overlay}>
            <Text style={styles.glyph}>{GESTURE_COPY[step.gesture].glyph}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.controls}>
        {phase === "intro" ? (
          <>
            <Text style={styles.stepLabelLight}>Step 1 of 4 · Identity</Text>
            <Text style={styles.instructionLight}>Hold the phone at eye level</Text>
            <Text style={styles.hintLight}>
              Three quick head movements. One small frame per movement is sent once for a live-person
              check, then discarded. Your face is never stored.
            </Text>
            <PrimaryButton label="Start check" onPress={start} />
          </>
        ) : phase === "running" && step ? (
          <>
            <Text style={styles.stepLabelLight}>
              Movement {step.index + 1} of {step.total}
            </Text>
            <Text style={styles.instructionLight}>{GESTURE_COPY[step.gesture].label}</Text>
            <View style={styles.progressRow}>
              {Array.from({ length: step.total }, (_, i) => (
                <View
                  key={i}
                  style={[styles.progressDot, i <= step.index && styles.progressDotOn]}
                />
              ))}
            </View>
          </>
        ) : (
          <Text style={styles.instructionLight}>Checking…</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#141210" },
  top: { paddingHorizontal: space.lg, paddingTop: space.xxl, paddingBottom: space.sm },
  viewport: { flex: 1, overflow: "hidden" },
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  glyph: { fontSize: 96, color: "#FFFFFF", opacity: 0.9 },
  controls: { padding: space.lg, paddingBottom: space.xxl, gap: space.sm, backgroundColor: "#141210" },
  stepLabelLight: { ...type.meta, color: "#F4C9BC", fontWeight: "700" },
  instructionLight: { ...type.subtitle, color: "#FFFFFF" },
  hintLight: { ...type.meta, color: "#C9BEB2" },
  progressRow: { flexDirection: "row", gap: space.xs, marginTop: space.xs },
  progressDot: { height: 6, flex: 1, borderRadius: radius.pill, backgroundColor: "#3A342E" },
  progressDotOn: { backgroundColor: color.primary },
  center: { alignItems: "center", gap: space.md, paddingVertical: space.xxl },
  badge: {
    width: 88,
    height: 88,
    borderRadius: radius.pill,
    backgroundColor: color.successSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { ...type.display, color: color.text },
  muted: { ...type.body, color: color.muted },
});

/** Restore this task's saved draft before rendering, so a JS reload never starts an empty one over it. */
export default function ReportIdentityScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const ready = useDraftReady(getTask(id ?? "").id);
  return ready ? <ReportIdentityBody /> : <DraftLoading />;
}
