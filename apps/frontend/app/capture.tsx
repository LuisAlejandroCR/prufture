// capture.tsx: photo + GPS + timestamp, then hash + sign + enqueue. Must work in airplane mode.
// TODO(block1): wire expo-camera preview and expo-location; this is the flow skeleton.

import { router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { captureProof } from "../src/capture";

export default function CaptureScreen() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onCapture() {
    setBusy(true);
    setError(null);
    try {
      await captureProof({ taskId: "solar-panel-install" });
      router.replace("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.screen}>
      <Text style={styles.hint}>Point at the installed asset and capture. No signal needed.</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable style={styles.shutter} onPress={onCapture} disabled={busy}>
        <Text style={styles.shutterText}>{busy ? "Signing..." : "Capture"}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 16, backgroundColor: "#fff", justifyContent: "center", gap: 16 },
  hint: { textAlign: "center", color: "#555" },
  error: { textAlign: "center", color: "#b00020" },
  shutter: { minHeight: 56, borderRadius: 12, backgroundColor: "#1560d4", alignItems: "center", justifyContent: "center" },
  shutterText: { color: "#fff", fontSize: 18, fontWeight: "700" },
});
