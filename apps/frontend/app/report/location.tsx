// report/location.tsx: confirm an approximate area without making the reporter
// manage coordinates. No latitude or longitude in the UI. If permission is denied
// the reporter can still continue. Uses expo-location + src/geohash (coarse, <=5
// chars) and writes only the coarse cell into the draft.

import * as Location from "expo-location";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Icon } from "../../src/components/icons/Icon";
import { BackLink, Notice, PrimaryButton, ReportProgress, Screen, SecondaryButton } from "../../src/components/ui";
import { encodeGeohash } from "../../src/geohash";
import { ensureDraft, setArea } from "../../src/report-draft";
import { getTask } from "../../src/tasks";
import { color, radius, space, type } from "../../src/theme";

type State = "checking" | "ready" | "denied" | "error";

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
      setCell(encodeGeohash(pos.coords.latitude, pos.coords.longitude, 5));
      setState("ready");
    } catch {
      setState("error");
    }
  }, []);

  useEffect(() => {
    detect();
  }, [detect]);

  const useArea = () => {
    setArea(cell, task.area);
    router.replace({ pathname: "/report/review", params: { id: task.id } });
  };

  const continueWithout = () => {
    setArea("", task.area);
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
          <>
            <PrimaryButton label="Try again" onPress={detect} />
            <SecondaryButton label="Continue without an area" onPress={continueWithout} />
          </>
        ) : undefined
      }
    >
      <BackLink label="Back" onPress={() => router.back()} />
      <ReportProgress step={4} label="Review" />

      {state === "checking" ? (
        <View style={styles.center}>
          <Icon name="location" size={32} color={color.faint} />
          <Text style={styles.body}>Finding your approximate area...</Text>
        </View>
      ) : null}

      {state === "ready" ? (
        <View style={styles.card}>
          <Icon name="location" size={28} color={color.success} />
          <Text style={styles.title}>Approximate area added</Text>
          <Text style={styles.area}>{task.area}</Text>
          <Text style={styles.fine}>Only a rough area is saved, never your exact position.</Text>
        </View>
      ) : null}

      {state === "denied" ? (
        <Notice tone="warning" icon="location">
          We could not add the area. You can allow location access, or continue if this task permits
          it.
        </Notice>
      ) : null}

      {state === "error" ? (
        <Notice tone="warning" icon="location">
          We could not read a location right now. Try again, or continue without an area.
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
