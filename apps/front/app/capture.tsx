// capture.tsx: live camera preview + coarse GPS, then hash + sign + enqueue. Works in airplane mode.
// GPS radio still resolves offline; if it does not, the proof is still signed with an empty geo cell.

import { CameraView, useCameraPermissions } from "expo-camera";
import * as FileSystem from "expo-file-system";
import * as Location from "expo-location";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { base64ToBytes, captureProof } from "../src/capture";
import { encodeGeohash } from "../src/geohash";

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
      <View style={styles.screen}>
        <Text style={styles.hint}>Checking camera permission…</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.screen}>
        <Text style={styles.hint}>Prufture needs the camera to photograph field evidence.</Text>
        <Pressable style={styles.shutter} onPress={requestPermission}>
          <Text style={styles.shutterText}>Grant camera access</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <CameraView ref={cameraRef} style={styles.preview} facing="back" />
      <Text style={styles.hint}>
        Point at the installed asset and capture. No signal needed.
        {locationGranted ? "" : " (location off — proof will have no geo cell)"}
      </Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable style={styles.shutter} onPress={onCapture} disabled={busy}>
        <Text style={styles.shutterText}>{busy ? "Signing…" : "Capture"}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 16, backgroundColor: "#fff", justifyContent: "center", gap: 16 },
  preview: { flex: 1, borderRadius: 12, overflow: "hidden" },
  hint: { textAlign: "center", color: "#555" },
  error: { textAlign: "center", color: "#b00020" },
  shutter: { minHeight: 56, borderRadius: 12, backgroundColor: "#1560d4", alignItems: "center", justifyContent: "center" },
  shutterText: { color: "#fff", fontSize: 18, fontWeight: "700" },
});
