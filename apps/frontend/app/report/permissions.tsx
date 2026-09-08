// report/permissions.tsx: an explicit, honest access screen before any capture.
// Camera and location are both required — no camera, no report; no location, no
// report (proof of where is the point). One card per permission; Continue unlocks
// only when both are granted. Denied -> an open-settings CTA, no way past.
// Presentation over src/permissions.ts — no raw permission calls live in this file.

import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { Icon } from "../../src/components/icons/Icon";
import { BackLink, PrimaryButton, Screen, SectionLabel } from "../../src/components/ui";
import {
  getPermissionState,
  RATIONALE,
  requestCamera,
  requestLocation,
  type PermissionState,
  type PermissionStatus,
} from "../../src/permissions";
import { ensureDraft } from "../../src/report-draft";
import { getTask } from "../../src/tasks";
import { color, radius, space, target, type } from "../../src/theme";

export default function ReportPermissionsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const task = getTask(id ?? "");
  ensureDraft(task.id);

  const [state, setState] = useState<PermissionState>({ camera: "undetermined", location: "undetermined" });

  const refresh = useCallback(async () => {
    setState(await getPermissionState());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const askCamera = async () => {
    const camera = await requestCamera();
    setState((s) => ({ ...s, camera }));
  };
  const askLocation = async () => {
    const location = await requestLocation();
    setState((s) => ({ ...s, location }));
  };

  const canContinue = state.camera === "granted" && state.location === "granted";

  const next = () =>
    router.replace({ pathname: "/report/identity", params: { id: task.id } });

  return (
    <Screen
      footer={
        <PrimaryButton
          label="Continue"
          onPress={next}
          disabled={!canContinue}
          accessibilityHint={!canContinue ? "Allow the camera and location to continue" : undefined}
        />
      }
    >
      <BackLink label="Back" onPress={() => router.back()} />
      <SectionLabel>Access this report needs</SectionLabel>
      <Text style={styles.title} accessibilityRole="header">
        Two permissions
      </Text>

      <PermissionCard
        icon="camera"
        name="Camera"
        purpose={RATIONALE.camera}
        status={state.camera}
        onAllow={askCamera}
      />
      <PermissionCard
        icon="location"
        name="Location"
        purpose={RATIONALE.location}
        status={state.location}
        onAllow={askLocation}
      />
    </Screen>
  );
}

function PermissionCard({
  icon,
  name,
  purpose,
  status,
  onAllow,
}: {
  icon: "camera" | "location";
  name: string;
  purpose: string;
  status: PermissionStatus | "pending";
  onAllow: () => void;
}) {
  const granted = status === "granted";
  const blocked = status === "denied";
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <View style={styles.cardIcon}>
          <Icon name={icon} size={20} color={granted ? color.success : color.muted} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.cardName}>
            {name} <Text style={styles.tag}>required</Text>
          </Text>
          <Text style={styles.cardPurpose}>{purpose}</Text>
        </View>
      </View>

      {granted ? (
        <Text style={styles.ok}>Allowed</Text>
      ) : blocked ? (
        <View style={{ gap: space.xs }}>
          <Text style={styles.blocked}>
            Blocked. Open Settings to allow {name.toLowerCase()}, then come back.
          </Text>
          <Pressable
            onPress={() => Linking.openSettings()}
            accessibilityRole="button"
            accessibilityLabel="Open settings"
            style={({ pressed }) => [styles.link, pressed && styles.pressed]}
          >
            <Text style={styles.linkText}>Open settings</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.actions}>
          <Pressable
            onPress={onAllow}
            accessibilityRole="button"
            accessibilityLabel={`Allow ${name}`}
            style={({ pressed }) => [styles.allow, pressed && styles.pressed]}
          >
            <Text style={styles.allowText}>Allow</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  title: { ...type.display, color: color.text },
  card: {
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.md,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
  },
  cardHead: { flexDirection: "row", gap: space.md, alignItems: "flex-start" },
  cardIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: color.surfaceSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  cardName: { ...type.subtitle, color: color.text },
  tag: { ...type.meta, color: color.muted, fontWeight: "600" },
  cardPurpose: { ...type.meta, color: color.muted },
  actions: { flexDirection: "row", alignItems: "center", gap: space.md, flexWrap: "wrap" },
  allow: {
    minHeight: target.min,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    backgroundColor: color.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  allowText: { ...type.subtitle, color: color.primary, fontWeight: "700" },
  link: { minHeight: target.min, justifyContent: "center" },
  linkText: { ...type.meta, color: color.primary, fontWeight: "700" },
  ok: { ...type.meta, color: color.success, fontWeight: "700" },
  blocked: { ...type.meta, color: color.attention, fontWeight: "600" },
  pressed: { opacity: 0.7 },
});
