// report/location.tsx: confirm where the activity happened. Location is mandatory —
// there is no "continue without" path. No latitude or longitude in the UI. Two tiers
// are produced: a coarse 5-char cell (plaintext, this is what the app signs) shown
// back to the reporter, and a 9-char precise cell encrypted on-device to the
// programme team's key (src/location-seal.ts) — never signed, never on-chain.

import * as Location from "expo-location";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Icon } from "../../src/components/icons/Icon";
import { BackLink, Notice, PrimaryButton, ReportProgress, Screen, SecondaryButton } from "../../src/components/ui";
import { identityStepEnabled } from "../../src/flags";
import { encodeGeohash } from "../../src/geohash";
import { sealPrecise } from "../../src/location-seal";
import { ensureDraft, setArea, setPreciseLocation } from "../../src/report-draft";
import { getTask } from "../../src/tasks";
import { color, radius, space, type } from "../../src/theme";

type State = "checking" | "ready" | "denied" | "error";

const PROGRAMME_PUBKEY = process.env.EXPO_PUBLIC_PROGRAMME_PUBKEY ?? "";

/** Encrypt the precise point to the programme key. Never throws — a missing/invalid
 *  key just means no precise blob is stored; the coarse cell still anchors the proof. */
function sealPrecisePoint(lat: number, lng: number, capturedAt: number): string {
  if (!PROGRAMME_PUBKEY) return "";
  try {
    return sealPrecise(
      PROGRAMME_PUBKEY,
      JSON.stringify({ geohash9: encodeGeohash(lat, lng, 9), capturedAt }),
    );
  } catch {
    return "";
  }
}

export default function ReportLocationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const task = getTask(id ?? "");
  ensureDraft(task.id);

  const [state, setState] = useState<State>("checking");
  const [cell, setCell] = useState("");

  const detect = useCallback(async () => {
    setState("checking");
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) {
        setState("denied");
        return;
      }
      const pos =
        (await Location.getLastKnownPositionAsync()) ??
        (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low }));
      if (!pos) {
        setState("error");
        return;
      }
      const { latitude, longitude } = pos.coords;
      const coarse = encodeGeohash(latitude, longitude, 5);
      setCell(coarse);
      setArea(coarse, task.area);
      setPreciseLocation(sealPrecisePoint(latitude, longitude, Math.floor(pos.timestamp ?? Date.now())));
      setState("ready");
    } catch {
      setState("error");
    }
  }, [task.area]);

  useEffect(() => {
    detect();
  }, [detect]);

  const useArea = () => {
    router.replace({ pathname: "/report/review", params: { id: task.id } });
  };

  return (
    <Screen
      footer={
        state === "ready" ? (
          <>
            <PrimaryButton label="Use this area" onPress={useArea} />
            <SecondaryButton label="Try again" icon="retry" onPress={detect} />
          </>
        ) : state === "denied" || state === "error" ? (
          <PrimaryButton label="Try again" onPress={detect} />
        ) : undefined
      }
    >
      <BackLink label="Back" onPress={() => router.back()} />
      <ReportProgress
        step={identityStepEnabled() ? 4 : 3}
        total={identityStepEnabled() ? 4 : 3}
        label="Review"
      />

      {state === "checking" ? (
        <View style={styles.center}>
          <Icon name="location" size={32} color={color.faint} />
          <Text style={styles.body}>Finding your approximate area...</Text>
        </View>
      ) : null}

      {state === "ready" ? (
        <View style={styles.card}>
          <Icon name="location" size={28} color={color.success} />
          <Text style={styles.title}>Approximate area detected</Text>
          <Text style={styles.area}>{`Approximate area: ${cell}`}</Text>
          <Text style={styles.fine}>
            This rough area is what the public record shows. Your precise location is encrypted on
            this phone for the programme team and is never published.
          </Text>
        </View>
      ) : null}

      {state === "denied" ? (
        <Notice tone="warning" icon="location">
          This report needs your location. Allow location access to continue — the public record
          only ever shows an approximate area.
        </Notice>
      ) : null}

      {state === "error" ? (
        <Notice tone="warning" icon="location">
          We could not read a location right now. Move to an open area and try again.
        </Notice>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", gap: space.md, paddingVertical: space.xxl },
  body: { ...type.body, color: color.muted },
  card: {
    alignItems: "center",
    gap: space.sm,
    padding: space.xl,
    borderRadius: radius.lg,
    backgroundColor: color.successSoft,
  },
  title: { ...type.title, color: color.text },
  area: { ...type.display, color: color.text },
  fine: { ...type.meta, color: color.muted, textAlign: "center" },
});
