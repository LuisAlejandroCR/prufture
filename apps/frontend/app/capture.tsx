// capture.tsx: live camera preview + coarse GPS, then hash + sign + enqueue. Works in airplane mode.
// GPS radio still resolves offline; if it does not, the proof is still signed with an empty geo cell.
// One primary action, >=44px targets, explicit busy and error states. Token-driven styling.

import { CameraView, useCameraPermissions } from "expo-camera";
import * as FileSystem from "expo-file-system";
import * as Location from "expo-location";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { base64ToBytes, captureProof } from "../src/capture";
import { encodeGeohash } from "../src/geohash";
import { color, radius, space, target, type } from "../src/theme";

const TASK_ID = "solar-panel-install";

export default function CaptureScreen() {
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [locationGranted, setLocationGranted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Location.requestForegroundPermissionsAsync()
      .then((r) => setLocationGranted(r.granted))
      .catch(() => setLocationGranted(false));
  }, []);

  async function readCoarseGeohash(): Promise<string> {
    if (!locationGranted) return "";
    try {
      const pos =
        (await Location.getLastKnownPositionAsync()) ??
        (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low }));
      return encodeGeohash(pos.coords.latitude, pos.coords.longitude, 5);
    } catch {
      return "";
    }
  }

  async function onCapture() {
    setBusy(true);
    setError(null);
    try {
      const photo = await cameraRef.current?.takePictureAsync({ quality: 0.4, base64: true });
      if (!photo) throw new Error("Camera returned no photo");
      const b64 =
        photo.base64 ??
        (await FileSystem.readAsStringAsync(photo.uri, { encoding: FileSystem.EncodingType.Base64 }));
      const geohash = await readCoarseGeohash();
      const proof = await captureProof({
        taskId: TASK_ID,
        mediaBytes: base64ToBytes(b64),
        geohash,
        mediaUri: photo.uri,
      });
      console.log("signed proof enqueued", proof.id, proof.proofHash, proof.status);
      router.replace("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!permission) {
    return (
      <View style={styles.gate}>
        <Text style={styles.hint}>Checking camera permission…</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.gate}>
        <Text style={styles.gateTitle}>Camera access needed</Text>
        <Text style={styles.hint}>Prufture uses the camera to photograph field evidence. Nothing is uploaded.</Text>
        <Pressable
          style={({ pressed }) => [styles.primary, pressed && styles.primaryPressed]}
          onPress={requestPermission}
          accessibilityRole="button"
        >
          <Text style={styles.primaryText}>Grant camera access</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <CameraView ref={cameraRef} style={styles.preview} facing="back" />

      <View style={styles.controls}>
        <Text style={styles.hint}>
          Point at the installed asset and capture. No signal needed.
          {locationGranted ? "" : "\nLocation is off, so the proof will carry no geo cell."}
        </Text>

        {error ? (
          <View style={styles.errorBox} accessibilityLiveRegion="polite">
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <Pressable
          style={({ pressed }) => [styles.primary, busy && styles.primaryBusy, pressed && styles.primaryPressed]}
          onPress={onCapture}
          disabled={busy}
          accessibilityRole="button"
          accessibilityState={{ disabled: busy, busy }}
          accessibilityLabel={busy ? "Signing proof" : "Capture and sign"}
        >
          {busy ? (
            <View style={styles.busyRow}>
              <ActivityIndicator color={color.brandText} />
              <Text style={styles.primaryText}>Signing…</Text>
            </View>
          ) : (
            <Text style={styles.primaryText}>Capture and sign</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  gate: {
    flex: 1,
    backgroundColor: color.bg,
    padding: space.xl,
    justifyContent: "center",
    alignItems: "center",
    gap: space.md,
  },
  gateTitle: { ...type.display, color: color.text, textAlign: "center" },
  preview: { flex: 1 },
  controls: { padding: space.lg, gap: space.md, backgroundColor: color.bg },
  hint: { ...type.body, textAlign: "center", color: color.textMuted, lineHeight: 21 },
  errorBox: {
    backgroundColor: color.pendingBg,
    borderRadius: radius.sm,
    padding: space.md,
  },
  errorText: { ...type.meta, color: color.danger, textAlign: "center" },
  primary: {
    minHeight: target.primary,
    borderRadius: radius.md,
    backgroundColor: color.brand,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.lg,
  },
  primaryBusy: { opacity: 0.9 },
  primaryPressed: { opacity: 0.85 },
  primaryText: { ...type.action, fontSize: 18, color: color.brandText },
  busyRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
});
