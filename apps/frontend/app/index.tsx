// index.tsx: queue screen — lists proofs and their sync state. Block 1 acceptance surface.

import { Link } from "expo-router";
import { useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import type { QueuedProof } from "@proof/core";
import { listProofs } from "../src/queue";

export default function QueueScreen() {
  const [proofs, setProofs] = useState<QueuedProof[]>([]);

  useEffect(() => {
    listProofs().then(setProofs).catch(() => setProofs([]));
  }, []);

  return (
    <View style={styles.screen}>
      <FlatList
        data={proofs}
        keyExtractor={(p) => p.id}
        ListEmptyComponent={<Text style={styles.empty}>No proofs yet. Capture one — works offline.</Text>}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={styles.task}>{item.taskId}</Text>
            <Text style={styles.status}>{statusLabel(item)}</Text>
          </View>
        )}
      />
      <Link href="/capture" asChild>
        <Pressable style={styles.cta}>
          <Text style={styles.ctaText}>Capture evidence</Text>
        </Pressable>
      </Link>
    </View>
  );
}

function statusLabel(p: QueuedProof): string {
  if (p.status === "pending_sync") return "pending sync";
  if (p.status === "synced") return "synced";
  return `attested by ${p.attestationCount}`;
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 16, backgroundColor: "#fff" },
  empty: { textAlign: "center", marginTop: 48, color: "#555" },
  row: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "#eee", flexDirection: "row", justifyContent: "space-between" },
  task: { fontSize: 16, fontWeight: "600" },
  status: { fontSize: 14, color: "#555" },
  cta: { minHeight: 48, borderRadius: 12, backgroundColor: "#1560d4", alignItems: "center", justifyContent: "center", marginTop: 12 },
  ctaText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
