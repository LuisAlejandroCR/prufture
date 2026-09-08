// report/capture.tsx: one required photo at a time. Instruction, step progress,
// camera, capture, flash, back, safety hint. Permission-denied and camera-error
// states are designed. After capture: preview with Use photo / Take again.
// Wired to expo-camera and src/report-draft; nothing uploads here.

import { CameraView, useCameraPermissions } from "expo-camera";
import * as FileSystem from "expo-file-system";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useRef, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { base64ToBytes } from "../../src/capture";
import { Icon } from "../../src/components/icons/Icon";
import { BackLink, Notice, PrimaryButton, ReportProgress, Screen, SecondaryButton } from "../../src/components/ui";
import { tap } from "../../src/feedback";
import { addPhoto, ensureDraft } from "../../src/report-draft";
import { getTask } from "../../src/tasks";
import { color, radius, space, target, type } from "../../src/theme";

type Shot = { uri: string; bytes: Uint8Array };

export default function ReportCaptureScreen() {
  const { id, step } = useLocalSearchParams<{ id: string; step: string }>();
  const router = useRouter();
  const task = getTask(id ?? "");
  const stepIndex = Math.max(0, Math.min(task.photos.length - 1, Number(step ?? "0") || 0));
  const total = task.photos.length;
  const spec = task.photos[stepIndex];

  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [flash, setFlash] = useState<"off" | "on">("off");
  const [busy, setBusy] = useState(false);
  const [shot, setShot] = useState<Shot | null>(null);
  const [error, setError] = useState<string | null>(null);

  ensureDraft(task.id);

  const next = () => {
    if (stepIndex + 1 < total) {
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
    } catch {
      setError("The camera did not return a photo. Try again, or move to better light.");
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

  // Permission denied.
  if (!permission.granted) {
    return (
      <Screen footer={<PrimaryButton label="Allow camera" onPress={requestPermission} />}>
        <BackLink label="Cancel" onPress={() => router.back()} />
        <View style={styles.gate}>
          <Icon name="camera" size={36} color={color.muted} />
          <Text style={styles.gateTitle}>Camera access is needed</Text>
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
        <ReportProgress step={2} label="Capture" />
        <Text style={styles.stepLabel}>
          Photo {stepIndex + 1} of {total}
        </Text>
        <Text style={styles.instruction}>{spec?.prompt}</Text>
        <Image source={{ uri: shot.uri }} style={styles.previewImage} accessibilityLabel="Photo you just took" />
      </Screen>
    );
  }

  // Live camera.
  return (
    <View style={styles.cameraScreen}>
      <View style={styles.topBar}>
        <BackLink label="Cancel" onPress={() => router.back()} />
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

      <View style={styles.cameraControls}>
        <Text style={styles.stepLabelLight}>
          Photo {stepIndex + 1} of {total}
        </Text>
        <Text style={styles.instructionLight}>{spec?.prompt}</Text>
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
  previewImage: {
    width: "100%",
    aspectRatio: 3 / 4,
    borderRadius: radius.md,
    backgroundColor: color.surfaceSoft,
  },
  cameraScreen: { flex: 1, backgroundColor: "#141210" },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: space.lg,
    paddingTop: space.xxl,
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
    paddingBottom: space.xxl,
    gap: space.sm,
    backgroundColor: "#141210",
  },
  stepLabelLight: { ...type.meta, color: "#F4C9BC", fontWeight: "700" },
  instructionLight: { ...type.subtitle, color: "#FFFFFF" },
  hintLight: { ...type.meta, color: "#C9BEB2" },
  shutter: {
    alignSelf: "center",
    width: 72,
    height: 72,
    borderRadius: radius.pill,
    borderWidth: 4,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    marginTop: space.sm,
  },
  shutterPressed: { opacity: 0.7 },
  shutterBusy: { opacity: 0.5 },
  shutterInner: { width: 54, height: 54, borderRadius: radius.pill, backgroundColor: color.primary },
});
