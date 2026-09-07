// report/sent.tsx: close the loop clearly. The programme team can review it now,
// and community confirmation is described plainly. No claim of final approval.
// Presentation over src/queue (reads the confirmation count for this report).

import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Icon } from "../../src/components/icons/Icon";
import { PrimaryButton, Screen, SecondaryButton } from "../../src/components/ui";
import { listProofs } from "../../src/queue";
import { color, radius, space, type } from "../../src/theme";

export default function ReportSentScreen() {
  const { id, hash } = useLocalSearchParams<{ id: string; hash: string }>();
  const router = useRouter();
  const [rowId, setRowId] = useState<string | null>(null);
  const [count, setCount] = useState(0);

  useEffect(() => {
    listProofs()
      .then((rows) => {
        const mine = hash ? rows.find((r) => r.proofHash === hash) : rows[0];
        if (mine) {
          setRowId(mine.id);
          setCount(mine.attestationCount);
        }
      })
      .catch(() => undefined);
  }, [hash]);

  return (
    <Screen
      footer={
        <>
          <PrimaryButton
            label="View status"
            onPress={() =>
              rowId
                ? router.replace({ pathname: "/status/[id]", params: { id: rowId } })
                : router.replace("/updates")
            }
          />
          <SecondaryButton label="Return home" onPress={() => router.replace("/(tabs)")} />
        </>
      }
    >
      <View style={styles.hero}>
        <View style={styles.badge}>
          <Icon name="check" size={40} color={color.information} />
        </View>
        <Text style={styles.title} accessibilityRole="header">
          Report sent
        </Text>
        <Text style={styles.body}>The programme team can now review it.</Text>
        <View style={styles.communityLine}>
          <Icon name="community" size={16} color={color.muted} />
          <Text style={styles.community}>
            {count > 0
              ? `Confirmed by ${count} community ${count === 1 ? "member" : "members"}`
              : "Waiting for another community report"}
          </Text>
        </View>
      </View>
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
  communityLine: { flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: space.sm },
  community: { ...type.meta, color: color.muted, fontWeight: "600" },
});
