// report/capture.tsx: one required photo at a time — instruction, progress, camera, preview with
// Use photo / Take again, and designed permission-denied and camera-error states.
// Wired to expo-camera and src/report-draft; nothing uploads here. `retake=1` (from Review) replaces
// one photo and returns to Review instead of walking the remaining steps.

import { CameraView, useCameraPermissions } from "expo-camera";
import * as FileSystem from "expo-file-system";
import { useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useRef, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { cameraFramePadding } from "../../src/camera-frame";
import { announce, failure, photoTaken } from "../../src/announce";
import { base64ToBytes } from "../../src/capture";
import { Icon } from "../../src/components/icons/Icon";
import {
  BackLink,
  EvidenceSteps,
  Notice,
  PrimaryButton,
  ReportProgress,
  Screen,
  SecondaryButton,
} from "../../src/components/ui";
import { tap } from "../../src/feedback";
import { identityStepEnabled } from "../../src/flags";
import { addPhoto, ensureDraft, getDraft } from "../../src/report-draft";
import { getTask } from "../../src/tasks";
import { cameraColor, color, radius, space, target, type } from "../../src/theme";

type Shot = { uri: string; bytes: Uint8Array };

export default function ReportCaptureScreen() {
  const { id, step, retake } = useLocalSearchParams<{ id: string; step: string; retake?: string }>();
  const router = useRouter();
  const task = getTask(id ?? "");
  const stepIndex = Math.max(0, Math.min(task.photos.length - 1, Number(step ?? "0") || 0));
  const total = task.photos.length;
  const spec = task.photos[stepIndex];
  const totalSteps = identityStepEnabled() ? 4 : 3;
  const progressStep = identityStepEnabled() ? 2 : 1;

  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [flash, setFlash] = useState<"off" | "on">("off");
  const [busy, setBusy] = useState(false);
  const [shot, setShot] = useState<Shot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const insets = useSafeAreaInsets();
  const frame = cameraFramePadding(insets);

  ensureDraft(task.id);

  const next = () => {
    if (retake === "1") {
      // Pop back to the Review that opened this retake, never stack a second one.
      router.back();
    } else if (stepIndex + 1 < total) {
      router.replace({ pathname: "/report/capture", params: { id: task.id, step: String(stepIndex + 1) } });
    } else if (task.questions.length > 0) {
      router.replace({ pathname: "/report/questions", params: { id: task.id } });
    } else {
      router.replace({ pathname: "/report/location", params: { id: task.id } });
    }
  };

  async function takePhoto() {
    setBusy(true);
    setError(null);
    try {
      const photo = await cameraRef.current?.takePictureAsync({ quality: 0.4, base64: true });
      if (!photo) throw new Error("no-photo");
      const b64 =
        photo.base64 ??
        (await FileSystem.readAsStringAsync(photo.uri, { encoding: FileSystem.EncodingType.Base64 }));
      setShot({ uri: photo.uri, bytes: base64ToBytes(b64) });
      void announce(photoTaken(stepIndex, total));
    } catch {
      const message = "The camera did not return a photo. Try again, or move to better light.";
      setError(message);
      void announce(failure(message));
    } finally {
      setBusy(false);
    }
  }

  const usePhoto = () => {
    if (!shot) return;
    void tap();
    addPhoto({ uri: shot.uri, bytes: shot.bytes, stepIndex });
    setShot(null);
    next();
  };

  // Permission still loading.
  if (!permission) {
    return (
      <Screen>
        <BackLink label="Cancel" onPress={() => router.back()} />
        <Text style={styles.loading}>Getting the camera ready...</Text>
      </Screen>
    );
  }

  if (!permission.granted) {
    return (
      <Screen footer={<PrimaryButton label="Allow camera" onPress={requestPermission} />}>
        <BackLink label="Cancel" onPress={() => router.back()} />
        <View style={styles.gate}>
          <Icon name="camera" size={36} color={color.muted} />
          <Text style={styles.gateTitle} accessibilityRole="header">
            Camera access is needed
          </Text>
          <Text style={styles.gateBody}>
            Prufture uses the camera to photograph the work. Nothing is uploaded. The photo stays on
            this phone.
          </Text>
        </View>
      </Screen>
    );
  }

  // Preview after capture.
  if (shot) {
    return (
      <Screen
        footer={
          <>
            <PrimaryButton label="Use photo" onPress={usePhoto} />
            <SecondaryButton label="Take again" icon="retry" onPress={() => setShot(null)} />
          </>
        }
      >
        <ReportProgress step={progressStep} total={totalSteps} label="Capture" />
        <EvidenceSteps
          prompts={task.photos.map((p) => p.prompt)}
          photos={task.photos.map((_, i) =>
            i === stepIndex ? shot.uri : getDraft()?.photos.find((p) => p.stepIndex === i)?.uri,
          )}
          current={stepIndex}
          size={56}
        />
        <Text style={styles.stepLabel}>
          Photo {stepIndex + 1} of {total}
        </Text>
        <Text style={styles.instruction} accessibilityRole="header">
          {spec?.prompt}
        </Text>
        {spec?.hint ? <Text style={styles.hint}>{spec.hint}</Text> : null}
        <Image
          source={{ uri: shot.uri }}
          style={styles.previewImage}
          accessibilityLabel="Photo you just took"
          accessibilityIgnoresInvertColors
        />
      </Screen>
    );
  }

  // Live camera.
  return (
    <View style={styles.cameraScreen}>
      {/* The one dark screen: light status bar on iOS; the root dark style returns on unmount. */}
      <StatusBar style="light" />
      <View style={[styles.topBar, { paddingTop: frame.top }]}>
        <BackLink label="Cancel" tone="onDark" onPress={() => router.back()} />
        <Pressable
          onPress={() => setFlash((f) => (f === "off" ? "on" : "off"))}
          accessibilityRole="button"
          accessibilityLabel={flash === "off" ? "Turn flash on" : "Turn flash off"}
          accessibilityState={{ selected: flash === "on" }}
          style={[styles.flashBtn, flash === "on" && styles.flashOn]}
        >
          <Icon name="flash" size={20} color={flash === "on" ? color.primary : color.muted} />
        </Pressable>
      </View>

      <View style={styles.viewport}>
        <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" flash={flash} />
      </View>

      <View style={[styles.cameraControls, { paddingBottom: frame.bottom }]}>
        <Text style={styles.stepLabelLight}>
          Photo {stepIndex + 1} of {total}
        </Text>
        <Text style={styles.instructionLight} accessibilityRole="header">
          {spec?.prompt}
        </Text>
        {spec?.hint ? <Text style={styles.hintLight}>{spec.hint}</Text> : null}

        {error ? <Notice tone="attention" icon="warning">{error}</Notice> : null}

        <Pressable
          onPress={takePhoto}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={busy ? "Taking photo" : "Take photo"}
          accessibilityState={{ disabled: busy, busy }}
          style={({ pressed }) => [styles.shutter, pressed && styles.shutterPressed, busy && styles.shutterBusy]}
        >
          <View style={styles.shutterInner} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { ...type.body, color: color.muted },
  gate: { alignItems: "center", gap: space.md, paddingVertical: space.xl },
  gateTitle: { ...type.title, color: color.text, textAlign: "center" },
  gateBody: { ...type.body, color: color.muted, textAlign: "center" },
  stepLabel: { ...type.meta, color: color.primary, fontWeight: "700" },
  instruction: { ...type.title, color: color.text },
  hint: { ...type.meta, color: color.muted },
  previewImage: {
    width: "100%",
    aspectRatio: 3 / 4,
    borderRadius: radius.md,
    backgroundColor: color.surfaceSoft,
  },
  cameraScreen: { flex: 1, backgroundColor: cameraColor.ground },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: space.lg,
    paddingBottom: space.sm,
  },
  flashBtn: {
    width: target.min,
    height: target.min,
    borderRadius: radius.pill,
    backgroundColor: color.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  flashOn: { backgroundColor: color.primarySoft },
  viewport: { flex: 1, overflow: "hidden" },
  cameraControls: {
    padding: space.lg,
    gap: space.sm,
    backgroundColor: cameraColor.ground,
  },
  stepLabelLight: { ...type.meta, color: cameraColor.step, fontWeight: "700" },
  instructionLight: { ...type.subtitle, color: cameraColor.text },
  hintLight: { ...type.meta, color: cameraColor.hint },
  shutter: {
    alignSelf: "center",
    width: 72,
    height: 72,
    borderRadius: radius.pill,
    borderWidth: 4,
    borderColor: cameraColor.text,
    alignItems: "center",
    justifyContent: "center",
    marginTop: space.sm,
  },
  shutterPressed: { opacity: 0.7 },
  shutterBusy: { opacity: 0.5 },
  shutterInner: { width: 54, height: 54, borderRadius: radius.pill, backgroundColor: color.primary },
});
