// report/permissions.tsx: explicit, honest access screen before any capture. Camera and location are
// both required (no location, no report); Continue unlocks only when both are granted, and denial
// shows an open-settings CTA. Cards use the shared InfoCard (Alternative C). All permission calls go
// through src/permissions.ts.

import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { AnswerChip, BackLink, InfoCard, PrimaryButton, Screen, SectionLabel } from "../../src/components/ui";
import {
  getPermissionState,
  RATIONALE,
  requestCamera,
  requestLocation,
  type PermissionState,
  type PermissionStatus,
} from "../../src/permissions";
import { nextAfterPermissions } from "../../src/flags";
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

  const next = () => router.replace(nextAfterPermissions(task.id));

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
      <Text style={styles.sub}>Both stay on this phone until you finish the report.</Text>

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
    <InfoCard
      icon={icon}
      title={`${name} (required)`}
      body={purpose}
      tint={granted ? color.success : color.primary}
      soft={granted ? color.successSoft : color.primarySoft}
    >
      <View style={styles.action}>
        {granted ? (
          <AnswerChip option="Yes, allowed" />
        ) : blocked ? (
          <View style={{ gap: space.xs }}>
            <Text style={styles.blocked}>Blocked. Open Settings to allow {name.toLowerCase()}, then come back.</Text>
            <Pressable
              onPress={() => Linking.openSettings()}
              accessibilityRole="button"
              accessibilityLabel="Open settings"
              style={({ pressed }) => [styles.allow, pressed && styles.pressed]}
            >
              <Text style={styles.allowText}>Open settings</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            onPress={onAllow}
            accessibilityRole="button"
            accessibilityLabel={`Allow ${name}`}
            style={({ pressed }) => [styles.allow, pressed && styles.pressed]}
          >
            <Text style={styles.allowText}>Allow {name.toLowerCase()}</Text>
          </Pressable>
        )}
      </View>
    </InfoCard>
  );
}

const styles = StyleSheet.create({
  title: { ...type.display, color: color.text },
  sub: { ...type.body, color: color.muted },
  action: { marginTop: space.sm },
  allow: {
    alignSelf: "flex-start",
    minHeight: target.min,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    backgroundColor: color.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  allowText: { ...type.subtitle, color: color.onPrimary, fontWeight: "700" },
  blocked: { ...type.meta, color: color.text, fontWeight: "600" },
  pressed: { opacity: 0.7 },
});
