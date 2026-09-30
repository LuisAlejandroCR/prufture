// report/location.tsx: confirm where the activity happened; mandatory, no lat/lng in the UI. Produces
// a coarse 5-char cell (plaintext, signed, shown back) and a 9-char precise cell sealed on-device to
// the programme key (src/location-seal.ts) — never signed, never on-chain. An assignment more than
// REPORTABLE_KM away is refused here: the area is not saved and the flow cannot continue.

import * as Location from "expo-location";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { CellMap } from "../../src/components/CellMap";
import { Icon } from "../../src/components/icons/Icon";
import { BackLink, InfoCard, Notice, PrimaryButton, ReportProgress, Screen, SecondaryButton } from "../../src/components/ui";
import { identityStepEnabled } from "../../src/flags";
import { encodeGeohash } from "../../src/geohash";
import { sealPrecise } from "../../src/location-seal";
import { ensureDraft, setArea, setPreciseLocation } from "../../src/report-draft";
import { REPORTABLE_KM, getTask, missionReach } from "../../src/tasks";
import { color, space, type } from "../../src/theme";
import { areaNameForCell, cityCentreForCell } from "../../src/useApproxArea";

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
  const { id, from } = useLocalSearchParams<{ id: string; from?: string }>();
  const router = useRouter();
  const task = getTask(id ?? "");
  ensureDraft(task.id);

  const [state, setState] = useState<State>("checking");
  const [cell, setCell] = useState("");
  const [areaName, setAreaName] = useState<string | null>(null);
  const [cityCentre, setCityCentre] = useState<{ latitude: number; longitude: number } | null>(null);

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
      // Name the cell centre (never the precise point); offline this stays null and the
      // assignment's area — or "Near you" for a self-started report — is kept instead.
      const name = await areaNameForCell(coarse);
      setAreaName(name);
      // Too far from the assignment: nothing is written to the draft, so no route (including a
      // Back to Review) can send a report from outside the mission's reach.
      if (missionReach(coarse, task) !== "far") {
        setArea(coarse, name ?? task.area);
        setPreciseLocation(sealPrecisePoint(latitude, longitude, Math.floor(pos.timestamp ?? Date.now())));
      }
      setState("ready");
      cityCentreForCell(coarse).then(setCityCentre).catch(() => undefined);
    } catch {
      setState("error");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.area, task.cell]);

  const tooFar = state === "ready" && missionReach(cell, task) === "far";

  useEffect(() => {
    detect();
  }, [detect]);

  const useArea = () => {
    // Opened from Review to fix a missing area: go back to that Review instead of stacking another.
    if (from === "review") router.back();
    else router.replace({ pathname: "/report/review", params: { id: task.id } });
  };

  return (
    <Screen
      footer={
        tooFar ? (
          <>
            <Notice tone="warning" icon="location">
              {`You are more than ${REPORTABLE_KM} km from ${task.area}, so this mission cannot be reported from here. You can report something near you instead.`}
            </Notice>
            <PrimaryButton label="Report something near you" onPress={() => router.replace("/report/pick")} />
            <SecondaryButton label="Try again" icon="retry" onPress={detect} />
          </>
        ) : state === "ready" ? (
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
        <>
          <Text style={styles.heading} accessibilityRole="header">
            Where was this?
          </Text>
          <CellMap
            cells={[{ key: "me", cell, tone: "self" }]}
            height={240}
            focusCell={cell}
            cityCentre={cityCentre}
            caption="Showing an approximate area (not exact location)"
            offlineLabel="Map unavailable without signal. Your area is still saved with the report."
          />
          <View style={styles.area}>
            <Icon name="location" size={18} color={color.success} />
            <Text style={styles.areaText}>{areaName ?? task.area}</Text>
          </View>
          <InfoCard
            icon="privacy"
            tint={color.success}
            soft={color.successSoft}
            title="Only the approximate area is public"
            body="The shaded square is about 5 km across. Your precise location is encrypted on this phone for the programme team and never published."
          />
        </>
      ) : null}

      {state === "denied" ? (
        <Notice tone="warning" icon="location">
          This report needs your location. Allow location access to continue. The public record
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
  heading: { ...type.display, color: color.text },
  area: { flexDirection: "row", alignItems: "center", gap: space.sm },
  areaText: { ...type.title, color: color.text, flex: 1 },
});
